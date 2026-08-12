// Bumped on every push. Shown in the header and logged in every session file so
// a stale cached build can never masquerade as current (finding #22).
export const VERSION = '0.5.0';

// Every tunable in the system lives here, per Blueprint §6.5:
// "Every constant is a parameter, not a truth." All values are logged
// into every session file so no number is ever published without its settings.

export const CONFIG = {
  // --- stillness metric ---
  STILL_WINDOW_S: 10,       // rolling window the motion metric is averaged over
  // Review findings #6/#15: the metric is now torso-lengths per SECOND (was
  // per-frame, which made it fps-dependent), and the effective threshold adapts
  // to each track's own observed noise floor — a hardcoded cliff calibrated on
  // synthetic data would make the stillness alarm unreachable on a noisy camera.
  STILL_THRESHOLD: 0.18,    // base: mean normalized limb motion (torso/s) below this = "still"
  STILL_NOISE_MULT: 1.6,    // effective threshold = max(base, min(noise floor x this, cap))
  STILL_ADAPTIVE_CAP: 0.6,  // the adaptive part can never exceed this — a swimmer whose
                            // "floor" is their own constant churn must not read as still.
                            // If camera noise pushes past the cap, stillness detection is
                            // degraded and the noise_floor CSV column makes that visible.
  NOISE_FLOOR_RECOVERY: 0.05, // how fast the decaying-min noise floor relaxes upward (/s)
  MAX_METRIC_DT: 0.25,      // finding #20: below ~4fps a swimmer's oscillating limbs ALIAS
                            // into apparent stillness — frames farther apart than this hold
                            // the stillness clocks instead of feeding the metric garbage.
                            // (track-lost keeps working at any fps; it uses wall-clock time)
  BASE_ALARM_S: 15,         // stillness seconds before alarm, mid-pool
  EDGE_ALARM_S: 60,         // longer threshold near the wall (people rest there)
  EDGE_BUFFER_BODYLEN: 1.0, // "near the wall" = within this many torso-lengths of the traced edge
  DECAY_PER_S: 3,           // stillness seconds decayed per second of movement (no hard reset —
                            // one twitch must not clear the counter, Blueprint §6.5)

  // --- track-lost trigger (the submersion case, Blueprint §6.4) ---
  LOST_ALARM_S: 10,         // seconds a track can be missing (inside the zone) before alarm
  REACQUIRE_DIST_TORSO: 2.5,// a new track appearing within this distance of a lost one = same person
  REACQUIRE_MAX_AGE_S: 12,  // review #7: only recent losses can be reacquired — an old entry
                            // must not hand its stillness clock to an unrelated swimmer
  EDGE_EXIT_BODYLEN: 1.2,   // lost within this distance of the edge = probably climbed out, no alarm

  // --- tracker ---
  MAX_JUMP_TORSO: 1.6,      // max centroid move per frame, in torso-lengths (gate for matching)
  MAX_JUMP_PX_FLOOR: 48,    // absolute floor on the gate for tiny/far detections
  GRACE_FRAMES: 12,         // frames a track survives with no detection before counting as lost
  GATE_GROWTH_CAP: 2.5,     // review #8: the per-miss gate growth is capped at this multiplier —
                            // an aging ghost must not swallow a detection across the frame

  // --- system watchdog (review #9-#11: the app must never LOOK armed while blind) ---
  DETECT_TIMEOUT_S: 3,      // a detect() call that hasn't settled by now counts as failed
  SYSTEM_ALARM_ERRORS: 3,   // consecutive failed frames while armed -> system-failure alarm

  // --- detection ---
  KEYPOINT_MIN_SCORE: 0.3,  // ignore joints the model trusts less than this
  MIN_VALID_KEYPOINTS: 5,   // fewer trusted joints than this = not a person

  // --- experimental IDR struggle signal (logged, never alarms by default) ---
  STRUGGLE_ENABLED: true,       // compute + log it
  STRUGGLE_ALARMS: false,       // it does NOT trigger the alarm unless flipped deliberately
  VERT_RATIO: 1.35,             // keypoint bbox height/width above this = vertical posture
  PROGRESS_WINDOW_S: 5,         // window for forward-progress measurement
  PROGRESS_EPS_TORSO: 0.8,      // less than this much travel (in torso-lengths) = "no progress"
  STRUGGLE_MOTION: 0.5,         // limb motion (torso/s) ABOVE this while vertical + no progress = struggle

  // --- surface-struggle churn signature ---
  // Grounded in Carballo-Fazanes & Bierens 2020 (24 real drownings on video):
  // a drowning person submerges and resurfaces ~6x per 30s for up to ~2 min.
  // On camera that is a track that BLINKS — repeated loss/reacquire cycles in
  // one spot. Logged as a first-class signal; alarms only if deliberately enabled.
  CHURN_WINDOW_S: 45,       // window over which loss/reacquire cycles are counted
  CHURN_MIN_CYCLES: 3,      // this many cycles in one spot = surface-struggle flag
  CHURN_RADIUS_TORSO: 3.0,  // "one spot" = within this many torso-lengths
  CHURN_ALARMS: false,      // off by default: divers/handstand kids look similar

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
