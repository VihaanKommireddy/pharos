// The core of Pharos: per-track motion metric, stillness timer, and the two
// alarm triggers (stillness past threshold; track lost inside the zone).
// Blueprint §6 in full. Pure logic — no DOM, no TensorFlow.
//
// §6.1: a still body still DRIFTS. So the metric is limb motion relative to
// the body's own centroid, normalized by torso length — a drifting corpse-float
// scores near zero while its centroid crosses the whole frame.

import { pointInPolygon, distToPolygonEdge, poseBBox } from './geometry.js';

export class StillnessEngine {
  constructor(cfg) {
    this.cfg = cfg;
    this.state = new Map();    // trackId -> per-track state
    this.lostRegistry = [];    // recently lost inside the zone, pending reacquire/alarm
    this.churnEvents = [];     // loss->reacquire cycles (the IDR bobbing signature, Bug #5)
    this.alarms = [];          // every alarm ever raised this session
  }

  setZone(polygon, pxPerMeter) {
    this.zone = polygon || null;
    this.pxPerMeter = pxPerMeter || null;
  }

  // tracks: active tracks from Tracker. lostNow: tracks lost this frame.
  // t: seconds, dt: seconds since last update.
  // Returns { people, alarmsNow } — people = per-track computed rows for
  // UI + logging; alarmsNow = alarms raised THIS update.
  update(tracks, lostNow, t, dt) {
    const cfg = this.cfg;
    const alarmsNow = [];
    const people = [];
    if (!this.zone) return { people, alarmsNow };
    dt = Math.min(Math.max(dt, 0.001), 0.5); // clamp: a hung tab must not add minutes
    this.churnEvents = this.churnEvents.filter((e) => t - e.t <= cfg.CHURN_WINDOW_S);

    const seen = new Set();
    for (const tr of tracks) {
      seen.add(tr.id);
      const inRegion = pointInPolygon(tr.centroid, this.zone);
      let st = this.state.get(tr.id);
      if (!st) {
        st = {
          prevRel: null, motionWin: [], stillS: 0, posHist: [],
          noiseFloor: null, struggle: false, churn: false, alarmed: false,
        };
        // Reacquire check: does this new track resurrect a lost one?
        // Review #7/#9: match the NEAREST recent entry, never the first-inserted —
        // a bystander's flicker must not consume (and cancel) a submerged
        // victim's pending alarm, and stale entries must not hand their
        // stillness clock to an unrelated swimmer arriving later.
        let best = null, bestD = Infinity;
        for (const lost of this.lostRegistry) {
          if (t - lost.lostT > cfg.REACQUIRE_MAX_AGE_S) continue;
          const d = Math.hypot(lost.centroid.x - tr.centroid.x, lost.centroid.y - tr.centroid.y);
          if (d <= lost.torso * cfg.REACQUIRE_DIST_TORSO && d < bestD) { best = lost; bestD = d; }
        }
        if (best) {
          this.lostRegistry = this.lostRegistry.filter((l) => l !== best);
          // BUG #5: the 2020 video study shows drowning people submerge and
          // resurface repeatedly. A reappearance must INHERIT the stillness
          // clock, not reset it — and each cycle is itself a signal.
          st.stillS = best.stillS || 0;
          this.churnEvents.push({ t, x: tr.centroid.x, y: tr.centroid.y });
        }
        this.state.set(tr.id, st);
      }

      // Review #10: a ghost track carries the frozen keypoints of its last real
      // detection. Frozen pose = zero apparent motion = fake stillness. Hold
      // every clock while unobserved — accumulate nothing, decay nothing.
      // Finding #20: the same hold applies when frames arrive too far apart —
      // undersampled churn aliases into fake stillness (seen live at ~1fps).
      if (tr.fresh === false || dt > cfg.MAX_METRIC_DT) {
        people.push({
          id: tr.id, x: tr.centroid.x, y: tr.centroid.y, torso: tr.torso,
          inRegion: pointInPolygon(tr.centroid, this.zone), nearEdge: false,
          motion: null, stillS: st.stillS, noise: st.noiseFloor,
          struggle: st.struggle, churn: st.churn, state: tr.state, threshold: cfg.BASE_ALARM_S,
        });
        continue;
      }

      // --- motion metric (§6.1 + §6.2) ---
      const rel = [];
      for (const kp of tr.keypoints) {
        rel.push(kp.score >= cfg.KEYPOINT_MIN_SCORE
          ? { x: (kp.x - tr.centroid.x) / tr.torso, y: (kp.y - tr.centroid.y) / tr.torso }
          : null);
      }
      let motion = null;
      if (st.prevRel) {
        let sum = 0, n = 0;
        for (let i = 0; i < rel.length; i++) {
          if (rel[i] && st.prevRel[i]) {
            sum += Math.hypot(rel[i].x - st.prevRel[i].x, rel[i].y - st.prevRel[i].y);
            n++;
          }
        }
        // Review #6: divide by dt — the metric is torso-lengths per SECOND,
        // so the same physical motion scores the same at any frame rate.
        const rateDt = Math.min(Math.max(dt, 0.02), 0.5);
        if (n >= 3) motion = sum / n / rateDt;
      }
      st.prevRel = rel;

      if (motion !== null) {
        st.motionWin.push({ t, motion });
        const cutoff = t - cfg.STILL_WINDOW_S;
        while (st.motionWin.length && st.motionWin[0].t < cutoff) st.motionWin.shift();
      }
      const winMean = st.motionWin.length
        ? st.motionWin.reduce((s, e) => s + e.motion, 0) / st.motionWin.length
        : null;

      // Review #15 (the critical one): a fixed threshold calibrated on synthetic
      // data can sit below a real camera's keypoint-noise floor, making the
      // stillness alarm silently unreachable. Track a decaying MINIMUM of each
      // person's own window-mean — their observed noise floor — and set the
      // effective threshold at max(base, floor x multiplier). A noisy camera
      // raises the bar instead of pinning the counter at zero forever.
      if (winMean !== null) {
        st.noiseFloor = st.noiseFloor === null
          ? winMean
          : Math.min(st.noiseFloor * (1 + cfg.NOISE_FLOOR_RECOVERY * dt), winMean);
      }
      const effStill = Math.max(cfg.STILL_THRESHOLD,
        Math.min((st.noiseFloor || 0) * cfg.STILL_NOISE_MULT, cfg.STILL_ADAPTIVE_CAP));

      // --- stillness seconds, with decay not reset (§6.5) ---
      if (inRegion && winMean !== null) {
        if (winMean < effStill) st.stillS += dt;
        else st.stillS = Math.max(0, st.stillS - cfg.DECAY_PER_S * dt);
      } else if (!inRegion) {
        st.stillS = 0; // on the deck: not our problem (Blueprint step 4)
      }

      // --- position history for forward-progress (struggle signal) ---
      st.posHist.push({ t, x: tr.centroid.x, y: tr.centroid.y });
      const pCut = t - cfg.PROGRESS_WINDOW_S;
      while (st.posHist.length && st.posHist[0].t < pCut) st.posHist.shift();

      // --- experimental IDR struggle flag (logged, no alarm by default) ---
      st.struggle = false;
      if (cfg.STRUGGLE_ENABLED && inRegion && winMean !== null && st.posHist.length > 2) {
        const bb = poseBBox(tr.keypoints, cfg.KEYPOINT_MIN_SCORE);
        const vertical = bb && bb.w > 0 && bb.h / bb.w >= cfg.VERT_RATIO;
        const first = st.posHist[0];
        const travel = Math.hypot(tr.centroid.x - first.x, tr.centroid.y - first.y);
        const noProgress = travel < tr.torso * cfg.PROGRESS_EPS_TORSO;
        const highMotion = winMean > cfg.STRUGGLE_MOTION;
        st.struggle = !!(vertical && noProgress && highMotion);
      }

      // --- surface-struggle churn flag (Bug #5 signature) ---
      st.churn = false;
      if (inRegion) {
        const cycles = this.churnEvents.filter((e) =>
          Math.hypot(e.x - tr.centroid.x, e.y - tr.centroid.y) <= tr.torso * cfg.CHURN_RADIUS_TORSO).length;
        st.churn = cycles >= cfg.CHURN_MIN_CYCLES;
        if (cfg.CHURN_ALARMS && st.churn && !st.alarmed) {
          st.alarmed = true;
          const alarm = { t, trackId: tr.id, trigger: 'surface_struggle', cycles, at: { ...tr.centroid } };
          this.alarms.push(alarm);
          alarmsNow.push(alarm);
        }
      }

      // --- near-edge threshold (§6.3, the wall problem) ---
      const edgeDist = distToPolygonEdge(tr.centroid, this.zone);
      const nearEdge = edgeDist <= tr.torso * cfg.EDGE_BUFFER_BODYLEN;
      const threshold = nearEdge ? cfg.EDGE_ALARM_S : cfg.BASE_ALARM_S;

      // --- trigger 1: stillness ---
      if (inRegion && !st.alarmed && st.stillS >= threshold) {
        st.alarmed = true;
        const alarm = {
          t, trackId: tr.id, trigger: 'stillness',
          stillS: st.stillS, nearEdge, at: { ...tr.centroid },
        };
        this.alarms.push(alarm);
        alarmsNow.push(alarm);
      }
      // Review #12: re-arm only after the counter fully drains — comparing
      // against the frame-local threshold let the near-edge flag flap the
      // alarmed bit and re-fire forever on one continuously-still body.
      if (st.alarmed && st.stillS === 0) st.alarmed = false;

      if (cfg.STRUGGLE_ALARMS && st.struggle && !st.alarmed && inRegion) {
        st.alarmed = true;
        const alarm = { t, trackId: tr.id, trigger: 'struggle', at: { ...tr.centroid } };
        this.alarms.push(alarm);
        alarmsNow.push(alarm);
      }

      people.push({
        id: tr.id, x: tr.centroid.x, y: tr.centroid.y, torso: tr.torso,
        inRegion, nearEdge, motion: winMean, stillS: st.stillS,
        noise: st.noiseFloor, struggle: st.struggle, churn: st.churn,
        state: tr.state, threshold,
      });
    }

    // --- trigger 2: track lost inside the zone (§6.4) ---
    for (const tr of lostNow) {
      const inRegion = pointInPolygon(tr.centroid, this.zone);
      const edgeDist = distToPolygonEdge(tr.centroid, this.zone);
      const nearExit = edgeDist <= tr.torso * this.cfg.EDGE_EXIT_BODYLEN;
      if (inRegion && !nearExit) {
        const prior = this.state.get(tr.id);
        this.lostRegistry.push({
          trackId: tr.id, lostT: t, centroid: tr.centroid, torso: tr.torso,
          stillS: prior ? prior.stillS : 0, alarmed: false,
        });
      }
      this.state.delete(tr.id);
    }

    for (const lost of this.lostRegistry) {
      if (!lost.alarmed && t - lost.lostT >= cfg.LOST_ALARM_S) {
        lost.alarmed = true;
        const alarm = {
          t, trackId: lost.trackId, trigger: 'track_lost',
          lostForS: t - lost.lostT, at: { ...lost.centroid },
        };
        this.alarms.push(alarm);
        alarmsNow.push(alarm);
      }
    }
    // Alarmed-and-stale entries age out so the registry can't grow forever.
    this.lostRegistry = this.lostRegistry.filter((l) => !(l.alarmed && t - l.lostT > cfg.LOST_ALARM_S * 6));

    // Drop state for tracks that vanished without a lost event (e.g. left region edge).
    for (const id of [...this.state.keys()]) {
      if (!seen.has(id)) this.state.delete(id);
    }

    return { people, alarmsNow };
  }
}
