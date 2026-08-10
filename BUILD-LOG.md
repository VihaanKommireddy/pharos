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
