// Greedy centroid tracker with a max-distance gate and a grace window.
// Blueprint §4: "A full tracker is overkill for ≤6 people. About 80 lines."
// Pure logic — no DOM, no TensorFlow. Detections come in, tracks come out.

import { poseCentroid, torsoLength } from './geometry.js';

let nextId = 1;
export function _resetIds() { nextId = 1; } // tests only

export class Tracker {
  constructor(cfg) {
    this.cfg = cfg;
    this.tracks = new Map(); // id -> track
  }

  // detections: [{keypoints}], t: seconds. Returns {active, lostNow}
  // lostNow = tracks that crossed the grace window THIS update (for the
  // track-lost trigger — Blueprint §6.4, the person who vanishes).
  update(detections, t) {
    const cfg = this.cfg;
    const dets = [];
    for (const d of detections) {
      const c = poseCentroid(d.keypoints, cfg.KEYPOINT_MIN_SCORE);
      if (!c || c.n < cfg.MIN_VALID_KEYPOINTS) continue;
      const torso = torsoLength(d.keypoints, cfg.KEYPOINT_MIN_SCORE);
      if (!torso) continue;
      dets.push({ keypoints: d.keypoints, centroid: c, torso });
    }

    // Build all candidate (track, detection) pairs inside the gate, then
    // take them greedily nearest-first so a crossing swimmer steals the
    // closer body, not the first-listed one.
    const pairs = [];
    const trackArr = [...this.tracks.values()];
    trackArr.forEach((tr, ti) => {
      const gate = Math.max(cfg.MAX_JUMP_PX_FLOOR, tr.torso * cfg.MAX_JUMP_TORSO * (1 + tr.missed * 0.5));
      dets.forEach((d, di) => {
        const dist = Math.hypot(tr.centroid.x - d.centroid.x, tr.centroid.y - d.centroid.y);
        if (dist <= gate) pairs.push({ ti, di, dist });
      });
    });
    pairs.sort((a, b) => a.dist - b.dist);

    const takenT = new Set(), takenD = new Set();
    for (const p of pairs) {
      if (takenT.has(p.ti) || takenD.has(p.di)) continue;
      takenT.add(p.ti); takenD.add(p.di);
      const tr = trackArr[p.ti], d = dets[p.di];
      tr.centroid = d.centroid;
      tr.keypoints = d.keypoints;
      tr.torso = d.torso;
      tr.missed = 0;
      tr.lastSeenT = t;
      tr.state = 'tracked';
    }

    // Unmatched detections become new tracks.
    dets.forEach((d, di) => {
      if (takenD.has(di)) return;
      const tr = {
        id: nextId++,
        centroid: d.centroid, keypoints: d.keypoints, torso: d.torso,
        missed: 0, state: 'tracked', bornT: t, lastSeenT: t,
      };
      this.tracks.set(tr.id, tr);
    });

    // Unmatched tracks age out through the grace window.
    const lostNow = [];
    trackArr.forEach((tr, ti) => {
      if (takenT.has(ti)) return;
      tr.missed++;
      if (tr.missed <= cfg.GRACE_FRAMES) {
        tr.state = 'ghost'; // still alive, briefly undetected
      } else if (tr.state !== 'lost') {
        tr.state = 'lost';
        lostNow.push(tr);
        this.tracks.delete(tr.id);
      }
    });

    return { active: [...this.tracks.values()], lostNow };
  }

  // The track-lost trigger needs "did anyone reappear near here?"
  // Called by the stillness engine when a new track is born.
  static isNear(a, b, torso, mult) {
    return Math.hypot(a.x - b.x, a.y - b.y) <= torso * mult;
  }
}
