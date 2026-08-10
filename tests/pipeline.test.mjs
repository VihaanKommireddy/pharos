// Unit tests for the pure pipeline: geometry, tracker, stillness engine.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pointInPolygon, distToPolygonEdge, torsoLength, poseCentroid } from '../js/geometry.js';
import { Tracker, _resetIds } from '../js/tracker.js';
import { StillnessEngine } from '../js/stillness.js';
import { SessionLog, toCSV } from '../js/logger.js';
import { createDemoDetector, DEMO_ZONE } from '../js/detector.js';
import { CONFIG, DEMO_OVERRIDES } from '../js/config.js';

const CFG = { ...CONFIG, ...DEMO_OVERRIDES };
const RECT = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

// --- geometry ---------------------------------------------------------------

test('pointInPolygon: inside, outside, non-convex', () => {
  assert.equal(pointInPolygon({ x: 50, y: 50 }, RECT), true);
  assert.equal(pointInPolygon({ x: 150, y: 50 }, RECT), false);
  const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }];
  assert.equal(pointInPolygon({ x: 20, y: 80 }, L), true);   // in the L's leg
  assert.equal(pointInPolygon({ x: 80, y: 80 }, L), false);  // in the L's notch
});

test('distToPolygonEdge: center of 100-square is 50 from edge', () => {
  assert.ok(Math.abs(distToPolygonEdge({ x: 50, y: 50 }, RECT) - 50) < 1e-9);
  assert.ok(Math.abs(distToPolygonEdge({ x: 5, y: 50 }, RECT) - 5) < 1e-9);
});

function fakePose(cx, cy, torso = 50, jitter = 0, seed = 1, t = 0) {
  // 17 keypoints: shoulders at (±10, -torso/2), hips at (±8, +torso/2), rest scattered.
  // Jitter varies with t — frozen-offset jitter would be a rigid body, which the
  // engine (correctly) treats as still. Bug #1 in BUILD-LOG.md.
  const kps = [];
  const rnd = (i) => Math.sin(seed * 999 + i * 77 + t * 9.7) * jitter;
  for (let i = 0; i < 17; i++) kps.push({ x: cx + rnd(i), y: cy + rnd(i + 20), score: 0.9 });
  kps[5] = { x: cx - 10 + rnd(5), y: cy - torso / 2 + rnd(25), score: 0.9 };
  kps[6] = { x: cx + 10 + rnd(6), y: cy - torso / 2 + rnd(26), score: 0.9 };
  kps[11] = { x: cx - 8 + rnd(11), y: cy + torso / 2 + rnd(31), score: 0.9 };
  kps[12] = { x: cx + 8 + rnd(12), y: cy + torso / 2 + rnd(32), score: 0.9 };
  return { keypoints: kps };
}

test('torsoLength: shoulder-hip distance, with fallback for missing hips', () => {
  const t = torsoLength(fakePose(100, 100, 60).keypoints, 0.3);
  assert.ok(Math.abs(t - 60) < 2, `expected ~60, got ${t}`);
  const noHips = fakePose(100, 100, 60);
  noHips.keypoints[11].score = 0; noHips.keypoints[12].score = 0;
  assert.ok(torsoLength(noHips.keypoints, 0.3) > 0, 'fallback must produce a positive scale');
});

// --- tracker ----------------------------------------------------------------

test('tracker: stable ID across moving frames', () => {
  _resetIds();
  const tr = new Tracker(CFG);
  let id = null;
  for (let f = 0; f < 30; f++) {
    const { active } = tr.update([fakePose(100 + f * 5, 200)], f / 15);
    assert.equal(active.length, 1);
    if (id === null) id = active[0].id;
    assert.equal(active[0].id, id, 'ID must not change while moving smoothly');
  }
});

test('tracker: two crossing people keep their own IDs when both stay in gate', () => {
  _resetIds();
  const tr = new Tracker(CFG);
  let ids = null;
  for (let f = 0; f <= 40; f++) {
    const a = fakePose(100 + f * 8, 190);          // left -> right
    const b = fakePose(420 - f * 8, 210);          // right -> left
    const { active } = tr.update([a, b], f / 15);
    assert.equal(active.length, 2);
    if (!ids) ids = active.map((t) => t.id).sort();
  }
  // We don't demand perfect identity through the cross (greedy matcher, known
  // limitation, Blueprint §10) — but both tracks must survive with 2 distinct IDs.
  const finalIds = [...tr.tracks.keys()];
  assert.equal(finalIds.length, 2);
});

test('tracker: grace window survives brief dropouts, emits lost after it', () => {
  _resetIds();
  const tr = new Tracker(CFG);
  for (let f = 0; f < 10; f++) tr.update([fakePose(300, 300)], f / 15);
  // 5-frame dropout: ghost, not lost
  let lostSeen = [];
  for (let f = 10; f < 15; f++) {
    const { lostNow } = tr.update([], f / 15);
    lostSeen.push(...lostNow);
  }
  assert.equal(lostSeen.length, 0, 'must survive a short dropout');
  const { active } = tr.update([fakePose(302, 301)], 1.0);
  assert.equal(active.length, 1, 'reacquired inside grace');
  // Now a long dropout: must emit lost exactly once
  for (let f = 0; f < CFG.GRACE_FRAMES; f++) {
    const { lostNow } = tr.update([], 1.1 + f / 15);
    lostSeen.push(...lostNow);
  }
  const { lostNow } = tr.update([], 2.5);
  lostSeen.push(...lostNow);
  assert.equal(lostSeen.length, 1, 'exactly one lost event after grace expires');
});

// --- stillness engine -------------------------------------------------------

function runScenario(engine, tracker, frames, fps = 15) {
  // frames: (t) => detections[]
  const out = { alarms: [] };
  for (let f = 0; f < frames.count; f++) {
    const t = f / fps;
    const dets = frames.at(t);
    const { active, lostNow } = tracker.update(dets, t);
    const { alarmsNow } = engine.update(active, lostNow, t, 1 / fps);
    out.alarms.push(...alarmsNow);
  }
  return out;
}

test('stillness: swimmer with churning limbs never alarms', () => {
  _resetIds();
  const tr = new Tracker(CFG);
  const eng = new StillnessEngine(CFG);
  eng.setZone(RECT.map((p) => ({ x: p.x * 6, y: p.y * 6 })), 40); // 600x600 zone
  const res = runScenario(eng, tr, {
    count: 20 * 15, // 20 seconds
    at: (t) => [fakePose(300 + Math.sin(t * 2) * 40, 300, 50, 6, 3, t)], // jitter 6px ~ churn
  });
  assert.equal(res.alarms.length, 0, 'active swimmer must not alarm');
});

test('stillness: drifting still body DOES alarm (the §6.1 case)', () => {
  _resetIds();
  const tr = new Tracker(CFG);
  const eng = new StillnessEngine(CFG);
  eng.setZone(RECT.map((p) => ({ x: p.x * 6, y: p.y * 6 })), 40);
  const res = runScenario(eng, tr, {
    count: 20 * 15,
    // centroid drifts 3px/s across the pool, limbs frozen (jitter 0)
    at: (t) => [fakePose(200 + t * 3, 300, 50, 0, 3)],
  });
  assert.ok(res.alarms.some((a) => a.trigger === 'stillness'),
    'a drifting motionless body must still trigger the stillness alarm');
});

test('stillness: person outside the zone never alarms', () => {
  _resetIds();
  const tr = new Tracker(CFG);
  const eng = new StillnessEngine(CFG);
  eng.setZone([{ x: 500, y: 0 }, { x: 1100, y: 0 }, { x: 1100, y: 600 }, { x: 500, y: 600 }], 40);
  const res = runScenario(eng, tr, {
    count: 20 * 15,
    at: () => [fakePose(200, 300, 50, 0, 3)], // frozen still — but on the deck
  });
  assert.equal(res.alarms.length, 0, 'deck people are not our problem');
});

test('track-lost: vanishing mid-pool alarms; vanishing at the edge does not', () => {
  const zone = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }];
  // Case 1: vanish mid-pool
  _resetIds();
  let tr = new Tracker(CFG);
  let eng = new StillnessEngine(CFG);
  eng.setZone(zone, 40);
  let res = runScenario(eng, tr, {
    count: 20 * 15,
    at: (t) => (t < 5 ? [fakePose(300, 300, 50, 6, 3)] : []),
  });
  assert.ok(res.alarms.some((a) => a.trigger === 'track_lost'), 'mid-pool vanish must alarm');
  // Case 2: vanish right at the edge (climbing out)
  _resetIds();
  tr = new Tracker(CFG);
  eng = new StillnessEngine(CFG);
  eng.setZone(zone, 40);
  res = runScenario(eng, tr, {
    count: 20 * 15,
    at: (t) => (t < 5 ? [fakePose(590, 300, 50, 6, 3)] : []), // 10px from edge
  });
  assert.equal(res.alarms.filter((a) => a.trigger === 'track_lost').length, 0,
    'edge exit must NOT alarm');
});

test('decay not reset: one twitch does not clear the counter', () => {
  _resetIds();
  const tr = new Tracker(CFG);
  const eng = new StillnessEngine(CFG);
  eng.setZone([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }], 40);
  const fps = 15;
  let still = 0;
  for (let f = 0; f < 8 * fps; f++) {
    const t = f / fps;
    // still for 4s, one 0.2s twitch at t=4, then still again
    const twitch = t > 4 && t < 4.2;
    const { active, lostNow } = tr.update([fakePose(300, 300, 50, twitch ? 8 : 0, 3, t)], t);
    const { people } = eng.update(active, lostNow, t, 1 / fps);
    if (people.length) still = people[0].stillS;
  }
  assert.ok(still > 2, `counter must survive a twitch via decay; got ${still}`);
});

test('bug #5: stillness clock survives a submerge-resurface cycle', () => {
  _resetIds();
  const tr = new Tracker(CFG);
  const eng = new StillnessEngine(CFG);
  eng.setZone([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }], 40);
  const fps = 15;
  let still = 0;
  for (let f = 0; f < 12 * fps; f++) {
    const t = f / fps;
    // still at the surface 0-4s, submerged 4-6.5s, resurfaces still 6.5s+
    const visible = t < 4 || t >= 6.5;
    const dets = visible ? [fakePose(300, 300, 50, 0, 3, t)] : [];
    const { active, lostNow } = tr.update(dets, t);
    const { people } = eng.update(active, lostNow, t, 1 / fps);
    if (people.length) still = people[0].stillS;
  }
  // ~4s accumulated before submerging + ~5.5s after. A reset would leave ~5.5;
  // inheritance should put us clearly above 7.
  assert.ok(still > 7, `stillness clock must survive the dive; got ${still.toFixed(1)}`);
});

test('bug #5: repeated bobbing in one spot raises the churn flag and can alarm', () => {
  _resetIds();
  const cfgChurn = { ...CFG, CHURN_ALARMS: true, CHURN_MIN_CYCLES: 3 };
  const tr = new Tracker(cfgChurn);
  const eng = new StillnessEngine(cfgChurn);
  eng.setZone([{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }], 40);
  const fps = 15;
  const alarms = [];
  let churnSeen = false;
  for (let f = 0; f < 40 * fps; f++) {
    const t = f / fps;
    // 5s cycle: 3s visible struggling, 2s submerged — the measured IDR pattern
    const visible = (t % 5) < 3;
    const dets = visible ? [fakePose(300, 300, 50, 8, 3, t)] : [];
    const { active, lostNow } = tr.update(dets, t);
    const res = eng.update(active, lostNow, t, 1 / fps);
    alarms.push(...res.alarmsNow);
    if (res.people.some((p) => p.churn)) churnSeen = true;
  }
  assert.ok(churnSeen, 'churn flag must raise after repeated cycles in one spot');
  assert.ok(alarms.some((a) => a.trigger === 'surface_struggle'),
    'with CHURN_ALARMS on, the bobbing pattern must alarm');
});

// --- demo scenario end-to-end ----------------------------------------------

test('demo scenario: exactly the right people alarm', async () => {
  _resetIds();
  const demo = createDemoDetector();
  const tr = new Tracker(CFG);
  const eng = new StillnessEngine(CFG);
  eng.setZone(DEMO_ZONE, 40);
  const fps = 15;
  const alarms = [];
  for (let f = 0; f < 30 * fps; f++) {
    const t = f / fps;
    const dets = await demo.detect(t);
    const { active, lostNow } = tr.update(dets, t);
    const { alarmsNow } = eng.update(active, lostNow, t, 1 / fps);
    alarms.push(...alarmsNow);
  }
  assert.ok(alarms.some((a) => a.trigger === 'stillness'), 'floater B must raise stillness alarm');
  assert.ok(alarms.some((a) => a.trigger === 'track_lost'), 'submerger C must raise track-lost alarm');
  // Lapper A churns the whole time; walker D is outside the zone. Neither may alarm.
  assert.ok(alarms.length <= 3, `unexpected extra alarms: ${JSON.stringify(alarms)}`);
});

// --- logger -----------------------------------------------------------------

test('logger: CSV round-trip and false-alarm rate', () => {
  const log = new SessionLog(CFG);
  log.start('2026-08-09T20:00:00');
  log.tick(3600); // one hour of operation
  log.logFrame(1.0, [{ id: 1, x: 10, y: 20, torso: 50, motion: 0.01, stillS: 0, inRegion: true, nearEdge: false, struggle: false, state: 'tracked' }]);
  // Bug #3 regression: two alarms logged, then the OLDER one is acknowledged —
  // the label must land on it by identity, never on the newest row.
  log.logAlarm({ t: 5, trackId: 1, trigger: 'stillness' });
  log.logAlarm({ t: 9, trackId: 2, trigger: 'track_lost' });
  assert.equal(log.labelAlarm({ t: 5, trackId: 1, trigger: 'stillness' }, 'false_positive', 'resting on wall'), true);
  assert.equal(log.alarms[0].label, 'false_positive', 'older alarm got the label');
  assert.equal(log.alarms[1].label, 'unlabeled', 'newer alarm untouched');
  assert.equal(log.falseAlarmsPerHour(), 1);
  const csv = log.toFramesCSV();
  assert.ok(csv.startsWith('t,session,track,cx,cy'), 'frames CSV header');
  assert.ok(log.toAlarmsCSV().includes('false_positive'));
  assert.ok(toCSV([{ a: 'x,"y"' }]).includes('"x,""y"""'), 'CSV escaping');
});
