// Two detectors behind one interface: the real MoveNet, and a scripted demo
// scenario used for self-testing the whole pipeline with no camera and no pool
// (Testing Ladder rung 0 — even below "point the phone at a screen").
//
// Both return: { async detect(t) -> [{keypoints:[{x,y,score}x17]}], label }

export async function createRealDetector(video) {
  /* global poseDetection */
  const detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING }
  );
  return {
    label: 'movenet-multipose-lightning',
    async detect() {
      return detector.estimatePoses(video);
    },
  };
}

// ---------------------------------------------------------------------------
// Demo scenario. Four scripted people exercise every code path:
//   A "lapper"    — swims laps the whole time. Must NEVER alarm (false-positive check).
//   B "floater"   — swims, then goes still mid-pool while DRIFTING (checks §6.1:
//                   stillness must rise even though the centroid keeps moving).
//   C "submerger" — swims, then vanishes mid-pool (checks the track-lost trigger).
//   D "walker"    — walks the deck OUTSIDE the zone. Must be ignored entirely.
//
// Frame is 1280x720. Demo pool zone: rectangle (140,120)-(1140,600).
// ---------------------------------------------------------------------------

export const DEMO_ZONE = [
  { x: 140, y: 120 }, { x: 1140, y: 120 },
  { x: 1140, y: 600 }, { x: 140, y: 600 },
];
export const DEMO_PX_PER_METER = 40;

// Deterministic pseudo-random so every demo run is identical (repeatable tests).
function noise(seed, t) {
  const v = Math.sin(seed * 127.1 + t * 311.7) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

// 17 MoveNet keypoints laid out around a centroid, scaled by torso, with
// per-joint jitter of amplitude `jit` (in torso units). Horizontal swimmer plan.
const PLAN = [
  { x: 0.55, y: 0.00 },  // 0 nose
  { x: 0.58, y: -0.05 }, // 1 left eye
  { x: 0.58, y: 0.05 },  // 2 right eye
  { x: 0.52, y: -0.08 }, // 3 left ear
  { x: 0.52, y: 0.08 },  // 4 right ear
  { x: 0.35, y: -0.18 }, // 5 left shoulder
  { x: 0.35, y: 0.18 },  // 6 right shoulder
  { x: 0.15, y: -0.30 }, // 7 left elbow
  { x: 0.15, y: 0.30 },  // 8 right elbow
  { x: -0.02, y: -0.38 },// 9 left wrist
  { x: -0.02, y: 0.38 }, // 10 right wrist
  { x: -0.35, y: -0.14 },// 11 left hip
  { x: -0.35, y: 0.14 }, // 12 right hip
  { x: -0.62, y: -0.16 },// 13 left knee
  { x: -0.62, y: 0.16 }, // 14 right knee
  { x: -0.88, y: -0.12 },// 15 left ankle
  { x: -0.88, y: 0.12 }, // 16 right ankle
];

function skeleton(cx, cy, torsoPx, jit, seed, t, vertical = false) {
  return {
    keypoints: PLAN.map((p, i) => {
      // vertical posture: swap axes so the body reads upright to poseBBox
      const bx = vertical ? p.y * 0.7 : p.x;
      const by = vertical ? -p.x : p.y;
      return {
        x: cx + bx * torsoPx * 2.2 + noise(seed + i, t) * jit * torsoPx,
        y: cy + by * torsoPx * 2.2 + noise(seed + i + 50, t * 1.3) * jit * torsoPx,
        score: 0.9,
      };
    }),
  };
}

const SWIM_JIT = 0.16;  // limbs churn while swimming
const STILL_JIT = 0.004;// near-zero residual limb motion when still

export function createDemoDetector() {
  return {
    label: 'demo-scenario',
    zone: DEMO_ZONE,
    pxPerMeter: DEMO_PX_PER_METER,
    async detect(t) {
      const out = [];
      const T = 60; // scenario period

      // A: lapper — crosses the pool and back forever, torso 55px.
      {
        const phase = (t % 24) / 24;
        const x = phase < 0.5 ? 220 + phase * 2 * 820 : 1040 - (phase - 0.5) * 2 * 820;
        out.push(skeleton(x, 260, 55, SWIM_JIT, 7, t));
      }

      // B: floater — swims for 8s, then still + drifting (0.35 px/s per axis).
      {
        if (t < 8) {
          out.push(skeleton(400 + t * 18, 440, 55, SWIM_JIT, 21, t));
        } else {
          const d = t - 8;
          out.push(skeleton(400 + 8 * 18 + d * 3.5, 440 + Math.sin(d / 6) * 12, 55, STILL_JIT, 21, t));
        }
      }

      // C: submerger — swims 10s then vanishes entirely (mid-pool, far from edges).
      {
        if (t < 10) out.push(skeleton(700, 300 + Math.sin(t) * 20, 50, SWIM_JIT, 33, t));
        // after t=10: gone. No keypoints. The tracker must notice.
      }

      // D: deck walker — paces above the zone (y=70), must be filtered out.
      {
        const x = 300 + ((t * 40) % 700);
        out.push(skeleton(x, 70, 45, 0.08, 44, t, true));
      }

      return out;
    },
  };
}
