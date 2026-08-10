// Every tunable in the system lives here, per Blueprint §6.5:
// "Every constant is a parameter, not a truth." All values are logged
// into every session file so no number is ever published without its settings.

export const CONFIG = {
  // --- stillness metric ---
  STILL_WINDOW_S: 10,       // rolling window the motion metric is averaged over
  STILL_THRESHOLD: 0.012,   // mean normalized limb motion below this = "still"
  BASE_ALARM_S: 15,         // stillness seconds before alarm, mid-pool
  EDGE_ALARM_S: 60,         // longer threshold near the wall (people rest there)
  EDGE_BUFFER_BODYLEN: 1.0, // "near the wall" = within this many torso-lengths of the traced edge
  DECAY_PER_S: 3,           // stillness seconds decayed per second of movement (no hard reset —
                            // one twitch must not clear the counter, Blueprint §6.5)

  // --- track-lost trigger (the submersion case, Blueprint §6.4) ---
  LOST_ALARM_S: 10,         // seconds a track can be missing (inside the zone) before alarm
  REACQUIRE_DIST_TORSO: 2.5,// a new track appearing within this distance of a lost one = same person
  EDGE_EXIT_BODYLEN: 1.2,   // lost within this distance of the edge = probably climbed out, no alarm

  // --- tracker ---
  MAX_JUMP_TORSO: 1.6,      // max centroid move per frame, in torso-lengths (gate for matching)
  MAX_JUMP_PX_FLOOR: 48,    // absolute floor on the gate for tiny/far detections
  GRACE_FRAMES: 12,         // frames a track survives with no detection before counting as lost

  // --- detection ---
  KEYPOINT_MIN_SCORE: 0.3,  // ignore joints the model trusts less than this
  MIN_VALID_KEYPOINTS: 5,   // fewer trusted joints than this = not a person

  // --- experimental IDR struggle signal (logged, never alarms by default) ---
  STRUGGLE_ENABLED: true,       // compute + log it
  STRUGGLE_ALARMS: false,       // it does NOT trigger the alarm unless flipped deliberately
  VERT_RATIO: 1.35,             // keypoint bbox height/width above this = vertical posture
  PROGRESS_WINDOW_S: 5,         // window for forward-progress measurement
  PROGRESS_EPS_TORSO: 0.8,      // less than this much travel (in torso-lengths) = "no progress"
  STRUGGLE_MOTION: 0.035,       // limb motion ABOVE this while vertical + no progress = struggle

  // --- alarm ---
  ALARM_REBEEP_S: 3,        // siren repeats until acknowledged
  NTFY_REPEAT_S: 15,        // push re-sent until acknowledged (only if a topic is configured)

  // --- logging ---
  LOG_EVERY_N_FRAMES: 1,    // 1 = every frame (Blueprint §7.1)
  MAX_LOG_ROWS: 250000,     // hard cap so a forgotten session can't eat all memory
};

// Faster thresholds for the built-in demo scenario so a full test cycle
// (swim → still → alarm → submerge → alarm) fits in under a minute.
export const DEMO_OVERRIDES = {
  BASE_ALARM_S: 6,
  EDGE_ALARM_S: 20,
  LOST_ALARM_S: 5,
  STILL_WINDOW_S: 4,
};
