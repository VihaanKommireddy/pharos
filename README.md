# Pharos

**A pool stillness alarm that runs on a phone you already own.**
Browser-based. No install, no hardware to buy, no video leaves the device.

It watches a traced pool region, tracks every person in the water, and raises a
loud alarm when someone has been **still past a threshold** or has **disappeared
underwater and not come back up**. It does not "detect drowning" — it detects
measurable things, and it logs everything so the accuracy can be published.

**Pharos assists supervision. It never replaces it.**

## Run it

```bash
python3 -m http.server 4321
```

Open `http://localhost:4321` in Chrome (or deploy to GitHub Pages — camera needs
HTTPS or localhost). Pick **Demo scenario** to see the whole system work with no
camera: Start source → Load demo zone → ARM → watch the alarms fire.

For a real session: Live camera → trace the pool edge with your finger →
optionally set scale (2 taps on a lane line) → ARM.

## What's in here

| Path | What |
|---|---|
| `index.html` + `js/main.js` | UI shell, preflight checks, trace UI, arm/alarm flow |
| `js/tracker.js` | Greedy centroid tracker, grace window (pure, unit-tested) |
| `js/stillness.js` | The core: drift-removed limb-motion metric, stillness timer, track-lost trigger, surface-struggle (bobbing) signature (pure, unit-tested) |
| `js/detector.js` | MoveNet MultiPose wrapper + the scripted demo scenario |
| `js/logger.js` | Measurement harness — per-frame CSV, per-alarm CSV, session settings |
| `js/alarm.js` | Siren, alarm queue, ntfy.sh push, one-tap CALL 911 |
| `js/config.js` | Every tunable, in one place, logged with every session |
| `tests/` | `node --test tests/pipeline.test.mjs` — 15 tests |
| `BUILD-LOG.md` | Every bug found and fixed, honestly |

## Design decisions that are not accidents

- **The pool trace is mandatory.** The system will not arm without it. See
  `research/patent-US11216654B2.md` in the team folder — the trace is both
  functional and deliberate.
- **No automatic 911 call.** Browsers cannot place calls (tel: requires a human
  tap — that's the law of the platform), no commercial competitor auto-dials
  either, and a false 911 call is how a safety product gets banned. The alarm's
  job is to make a human look at the water in seconds: siren repeating until
  acknowledged, full-screen takeover, push to a second phone via ntfy.sh, and
  CALL 911 one tap away. See `research/emergency-escalation.md`.
- **Stillness, not "distress."** Distress is subjective; stillness and
  disappearance are measurable and defensible. The bobbing signature
  (`surface_struggle`) is grounded in the 2020 published video analysis of real
  drownings and is logged always, alarm-gated off by default.
- **The log is the product.** False alarms per hour, detection rate, time to
  alert — measured per pool, exported as CSV, with every config value recorded.
  Nobody else in this industry publishes those numbers.

## Status

v0.1 — pipeline verified end to end against the scripted demo scenario and unit
suite (15/15). Not yet validated on real water. The testing ladder (team folder,
Blueprint §8) goes: YouTube footage on a screen → dry run indoors → empty pool →
ordinary swimming → staged stillness per SAFETY-PROTOCOL.md.
