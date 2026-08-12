# Pharos — build log

*v0.1 build sprint, 2026-08-10. Every bug found in self-testing, in order.*
*Method: unit tests on the pure pipeline (node --test), then driving the real UI
in a browser against the scripted demo scenario, then fixing and re-verifying.*

## Bug #1 — test fixture generated a rigid body, engine correctly alarmed
**Found by:** unit test "swimmer with churning limbs never alarms" failing.
**What happened:** the fake swimmer's limb jitter didn't vary with time — a frozen
pose gliding across the pool. That IS a still body per §6.1, so the engine alarmed.
**The fix:** time-varying jitter in the fixture. The engine was right all along —
a false-positive test that vindicates the drift-removal design.

## Bug #2 — detection loop silently freezes when the tab is backgrounded ⚠ SEVERE
**Found by:** armed session showing `0s operating · 12 rows` after 30 real seconds.
**What happened:** the loop ran on requestAnimationFrame, which browsers pause for
background tabs and locked screens. A safety monitor that stops watching, silently,
is the worst failure mode this product can have.
**The fix:** a 300ms watchdog timer keeps the loop breathing when rAF stalls
(degraded to ~1fps by browser throttling, but alive), plus a visibilitychange
handler that warns the operator on return and writes the gap into the session log.
**Still true and documented:** browsers throttle background timers hard. The
operating rule stays "dedicated phone, screen on, wake lock" — the watchdog is a
safety net, not a license to background the app.

## Bug #3 — alarm acknowledgment labeled the wrong alarm
**Found by:** browser test — acknowledged the stillness alarm, the label landed on
the track_lost row that had arrived meanwhile.
**What happened:** `labelLastAlarm` labeled the newest row; a second alarm between
overlay and tap steals the label. Also: that second alarm never got an overlay at
all — `raise()` dropped it because one was active.
**The fix:** label by identity (time + track + trigger), and queue concurrent
alarms so each gets its own overlay + siren in order. Regression test added;
re-verified live: both rows labeled correctly, queued alarm displayed on ack.

## Bug #4 — "10000 fps" in the header
**Found by:** eyeballing the header during the armed session.
**What happened:** watchdog + rAF firing back-to-back gives near-zero frame deltas.
**The fix:** EMA smoothing + 120fps display clamp + ignore sub-millisecond deltas.

## Bug #5 — a drowning person's bobbing pattern could evade both triggers ⚠ DESIGN
**Found by:** the research pass (research/drowning-kinematics.md). The 2020
IJERPH study of 24 real drownings on video: victims submerge and resurface
~6 times per 30s for up to ~2 minutes — the track *blinks*, it doesn't hold still
continuously and it doesn't stay lost.
**What happened in the old design:** every resurfacing created a fresh track with
a zeroed stillness clock AND cancelled the pending track-lost alarm. The measured
presentation of real drowning was the exact pattern the system was blind to.
**The fix:** (a) a reacquired track *inherits* the stillness clock of the lost
track it resurrects; (b) repeated loss→reacquire cycles in one spot within 45s
raise a `surface_struggle` (bobbing) flag — logged always, alarm-capable behind
`CHURN_ALARMS` (off by default: divers and handstand kids produce a similar
pattern, and the false-alarm rate is the number that decides if this product
lives). Two regression tests added.

---

# Adversarial review pass (2026-08-10, 21 Opus agents, findings verified before acceptance)

Three reviewers (correctness / algorithm / safety-UX) + one skeptic per finding.
**16 findings confirmed, 1 refuted.** All confirmed findings fixed; each has a
regression test where the pure pipeline can express it.

## #6 — motion metric was per-FRAME, not per-second
Same physical motion scored 12x differently across frame rates. Metric is now
torso-lengths/second (`motion = Δ/n/dt`); all thresholds rescaled.

## #15 (critical) — stillness threshold could sit below a real camera's noise floor
The fixed threshold was calibrated against the demo's 0.22px synthetic jitter.
A skeptic reproduced it against the real modules: ≥ ~1.5px of independent
keypoint noise pins the stillness counter at exactly 0.0 forever — a face-down
floater would never alarm, silently, with a healthy green skeleton on screen.
**Fix:** each track keeps a decaying-minimum noise floor; effective threshold =
max(base, min(floor×1.6, cap 0.6)). The cap stops a constantly-churning swimmer
from reading as "still relative to themselves." The floor is logged per-frame in
the CSV (`noise_floor`) so the cliff is visible in data, never invisible.

## #7 — a bystander's flicker could cancel a submerged victim's pending alarm
Reacquire matched the FIRST registry entry in insertion order. Now: nearest
entry, within a 12s age window — and old entries can no longer hand their
stillness clock to an unrelated swimmer arriving later.

## #8 — uncapped matching gate let a ghost swallow detections across the frame
Gate growth capped at 2.5×; a distant new detection now births a new track and
the real lost event fires.

## #10 — ghost tracks fed frozen keypoints back in as "perfectly still"
Unobserved frames now hold every clock — no accumulation, no decay.

## #9/#11 — a failing pipeline kept the ARMED badge green
detect() now has a 3s deadline; three consecutive failures while armed raise a
full `system_failure` alarm ("PHAROS CANNOT SEE THE POOL") instead of a status
label nobody reads. A hung detect promise is force-released by the watchdog.

## #16/#17 — dead camera / resolution change looked like a calm pool
Stream `ended`/`mute` listeners, auto-resume on pause, and a per-frame
resolution check (rotation invalidates the traced zone) all feed the same
system-failure escalation.

## #13 — the siren could be silently muted
AudioContext is created/resumed inside the ARM tap (a real user gesture), an
audible test beep plays at ARM (unheard beep = unfixed sound = don't trust the
siren), and the phone vibrates on every alarm.

## #12 — near-edge threshold flapping re-fired the same alarm forever
Re-arm now requires the counter to fully drain. One still body = one alarm.

## #14 — wake lock was never re-acquired after the OS released it
Re-requested on every return to visibility while armed.

## #18 — re-tracing while armed desynced the UI zone from the engine zone
Trace/scale/zone controls are disabled while armed. Disarm to change the zone.

## #19 — window.prompt() froze detection while the false-alarm dialog sat open
Replaced with one-tap cause chips (Wall/Glare/Play/Merged/Other) on the overlay.

## #20 — undersampled churn aliases into fake stillness (found live at ~1fps)
Three false stillness alarms fired in a throttled tab — at 1fps an active
swimmer's oscillating limbs are indistinguishable from noise. Frames farther
apart than 250ms now hold the stillness clocks (track-lost is wall-clock based
and unaffected). This is a physics limit, documented, not a tuning problem.

**Refuted (1):** a claimed ARM-button dead-state on localStorage failure —
the skeptic showed updateZoneUI() runs on every trace tap, so the state heals.

---

## Verified working end to end (demo scenario, browser)
- Preflight 7/7 · demo source · zone restore from localStorage · ARM gate held
  until zone exists (patent rule) · skeletons + IDs + per-person stillness
  counters · stillness alarm with full red overlay, siren, CALL 911 tap target ·
  queued track-lost alarm shown after ack · labels on correct rows ·
  session harness: 61s operating, 2,077 frame rows, FA/hr computed ·
  CSV exports · 26fps in-foreground.

## Not yet verified (needs a real phone / real pool — next rungs of the ladder)
- Live camera path end-to-end (test browser blocks cameras by policy; the module
  is the same code path as v0.0, which ran on the laptop camera).
- MoveNet accuracy on real swimmers, glare, ripple — rung 1 (YouTube footage on a
  TV) then rungs 3–5 at a facility per SAFETY-PROTOCOL.md.
- ntfy.sh push delivery on a second phone.
- Thermal behavior on a phone (blueprint §2.2 warns of throttling).

---

# Findings from Vihaan's first real-user sessions (2026-08-11, from his exported CSVs)

## #21 — render-loop chain multiplication (PROVEN from his data)
His 49s demo session logged 34,373 rows for ONE track (~700 loop passes/sec),
a 6.8MB CSV, and `operating_seconds=6` against 48.6 real seconds. Every
watchdog-invoked pass was also scheduling an rAF continuation in `finally`, so
chains accumulated. **Fix:** exactly one pending continuation may exist
(`frameQueued` guard).

## #22 — alarms raised in the engine never reached the log or siren (UNRESOLVED cause)
In two of his sessions the demo floater exceeded the stillness threshold for
20-37 seconds (condition verifiably true in the CSV: in-region, not near edge,
motion under threshold) and the submerger vanished mid-pool — yet
`alarms=0` was recorded and no overlay appeared. The same code, same scenario,
same 700Hz regime fires both alarms correctly in two independent Node repros —
the repo code cannot produce his data. Leading suspicion: stale/mixed cached
modules (the page sat open across three same-evening pushes; python http.server
sends no cache headers). **Mitigations shipped since it cannot be proven
retroactively:** (a) VERSION constant shown in the header and stamped into every
session export — a stale build is now visible at a glance and attributable in
data; (b) an alarm-integrity reconciliation every armed frame — if the engine
has ever raised more alarms than were delivered, that mismatch itself raises a
system alarm. A silent alarm loss can no longer be silent.

## Also confirmed working in his real sessions
Tracker held IDs (ghost rate 0-0.4%), stillness inheritance and accumulation
behaved, per-second motion units in sane ranges, in-region filtering correct,
zone restore worked across three arm/disarm cycles in one page.
