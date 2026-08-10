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

    const seen = new Set();
    for (const tr of tracks) {
      seen.add(tr.id);
      const inRegion = pointInPolygon(tr.centroid, this.zone);
      let st = this.state.get(tr.id);
      if (!st) {
        st = {
          prevRel: null, motionWin: [], stillS: 0, posHist: [],
          struggle: false, alarmed: false,
        };
        this.state.set(tr.id, st);
        // Reacquire check: does this new track resurrect a lost one?
        this.lostRegistry = this.lostRegistry.filter((lost) => {
          const d = Math.hypot(lost.centroid.x - tr.centroid.x, lost.centroid.y - tr.centroid.y);
          return d > lost.torso * cfg.REACQUIRE_DIST_TORSO; // keep only non-matches
        });
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
        if (n >= 3) motion = sum / n;
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

      // --- stillness seconds, with decay not reset (§6.5) ---
      if (inRegion && winMean !== null) {
        if (winMean < cfg.STILL_THRESHOLD) st.stillS += dt;
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
      if (st.alarmed && st.stillS < threshold * 0.5) st.alarmed = false; // re-arm after real movement

      if (cfg.STRUGGLE_ALARMS && st.struggle && !st.alarmed && inRegion) {
        st.alarmed = true;
        const alarm = { t, trackId: tr.id, trigger: 'struggle', at: { ...tr.centroid } };
        this.alarms.push(alarm);
        alarmsNow.push(alarm);
      }

      people.push({
        id: tr.id, x: tr.centroid.x, y: tr.centroid.y, torso: tr.torso,
        inRegion, nearEdge, motion: winMean, stillS: st.stillS,
        struggle: st.struggle, state: tr.state, threshold,
      });
    }

    // --- trigger 2: track lost inside the zone (§6.4) ---
    for (const tr of lostNow) {
      const inRegion = pointInPolygon(tr.centroid, this.zone);
      const edgeDist = distToPolygonEdge(tr.centroid, this.zone);
      const nearExit = edgeDist <= tr.torso * this.cfg.EDGE_EXIT_BODYLEN;
      if (inRegion && !nearExit) {
        this.lostRegistry.push({ trackId: tr.id, lostT: t, centroid: tr.centroid, torso: tr.torso, alarmed: false });
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
