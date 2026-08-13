# Rescue-footage test — real drowning-rescue CCTV through Pharos v0.5.1

**Date:** 2026-08-11 · **first run of the full app against real rescue footage.**
Vihaan explicitly authorized downloading two publicly-viewable, survivor-outcome
rescue clips for local testing only — never training data, never redistributed,
**deleted immediately after this run.** Clips were played through the shipping
app (`?clip=` auto-load path), not analyzed by any separate script.

## Clips

| Clip | Source | What it actually is |
|---|---|---|
| Livonia (xEzGzJDbVkI) | NBC Chicago | **Studio news package** — two anchors + a CDC "swimming dangers" graphic + weather. Almost no raw pool CCTV. A poor test clip; kept only for the anchor-detection control. |
| Genesee (QFkhyBRbHQs) | 6abc / Genesee County Sheriff CCTV | **Real elevated fixed-camera pool CCTV** — whole basin in frame. The catalog's closest geometry match to a real Pharos install. The actual test. |

## Method caution (a real one, logged so it isn't repeated)

The first analysis attempt used a separate seek-stepped script and reported
**0 detections across the whole Livonia clip.** That was FALSE — a seek/decode
race (reading frames before they finished painting) plus a throttled background
browser pane. It was caught only by taking a screenshot and *seeing* two skeletons
on the anchors. **Lesson: verify detector output visually before trusting a
headless number; the shipping app's own render loop is the trustworthy instrument,
not an ad-hoc offline harness.** All results below come from the app itself,
foreground, at full speed.

## Results

### Livonia (control — dry humans on camera)
- MoveNet detected **both news anchors reliably** (2 skeletons) every time they
  were on screen (sampled t2–68, t103), and correctly detected **nobody** on the
  full-screen CDC graphic cards (t70–92). Confirms the app + detector work; a dry,
  frontal, well-lit human is trivial.

### Genesee (the real test — elevated pool CCTV)
1. **In-water people are invisible; a poolside figure is caught.** At t≈22
   (screenshot), MoveNet drew a skeleton on **one figure at the pool edge**
   (more out of the water) and **nothing on the people in the water** — not the
   drowning child, not the swimmers. This is the Tier-0 finding reproduced on real
   rescue CCTV at the exact target geometry.
2. **The track-lost trigger FIRED on real rescue footage.** At t≈33, during the
   rescue, Pharos raised its alarm: *"CHECK THE WATER — Swimmer (track 1)
   disappeared underwater 10s ago and has not come back up."* The submersion
   trigger — the one designed for exactly this case — produced the correct alarm
   on genuine footage of a child who was underwater.

## The honest read

**Encouraging:** the end-to-end pipeline produced the *right alarm* ("check the
water") during a real underwater emergency, on real fixed-camera pool CCTV, with
no tuning. That is a real milestone.

**But do not overclaim it.** The alarm almost certainly fired because a *poolside*
figure that MoveNet had been tracking was **lost** (the person moved, entered the
water, or the flickery detection simply dropped) — not because the system robustly
tracked the specific child underwater. We **cannot** say "Pharos detected the
drowning." The stillness trigger never fired, because bodies in the water are not
detected long enough to accumulate a stillness clock.

**The bottleneck is unchanged and now triple-confirmed** (Tier-0 negatives, the
lane-pool live run, and now real rescue CCTV): **stock MoveNet cannot see people
in water.** Fine-tuning the detector on swimmer data is not an enhancement — it is
the critical path, and every downstream trigger is only as good as it.

## What this run does NOT establish
- No true-positive/false-positive rate — this was two clips, observed, not a
  scored dataset.
- The track-lost alarm's correctness is unverified — plausibly right for the wrong
  reason (lost poolside track, not tracked-underwater child).
- Nothing about latency, or behavior once detection is fixed.

## Next
- The detector fine-tune (swimmer dataset) is the single highest-value next step.
- A proper scored run needs the catalog's fixed-camera clips (Genesee, the Tier-A
  wavepool set) with the incident timestamps hand-labeled, true/false positives
  counted per clip.

*Downloaded test clips deleted after this run, per the download-for-test-only
agreement. Nothing from real-incident footage trains any model.*
