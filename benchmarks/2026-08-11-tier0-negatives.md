# Tier-0 benchmark — stock detectors on real pool footage (negatives set)

**Date:** 2026-08-11 · **Pharos v0.4** · first measured numbers on real, licensed footage.
**Question:** what does the off-the-shelf detection stack actually see in real water —
and does Pharos false-alarm on ordinary, safe pool activity?

## Method

Offline seek-stepped analyzer (deterministic virtual 15 fps clock — reproducible,
immune to browser throttling): each clip stepped frame-by-frame through the real
production pipeline (`tracker.js` + `stillness.js`, production `CONFIG`, zone =
full frame, downscaled to 1280 px before inference). MoveNet MultiPose Lightning,
exactly as the app ships. Single-frame probes with COCO-SSD (v2) as a
second-opinion detector. No demo overrides, no tuning between clips.

Clips (licenses verified in `research/test-footage-negatives.md`; files local-only,
git-ignored — stock licenses forbid redistribution):

| Clip | Source / license | Angle | Content |
|---|---|---|---|
| floats.mp4 | Pexels 9044120 (Pexels License) | true overhead | 2 kids motionless on pool floats |
| nightpool.webm | Wikimedia Commons "Outdoor pool at night", CC BY-SA 4.0, credit **Almanta** | elevated fixed | crowded night swim, harsh artificial light |
| lanepool.mp4 | Pixabay 78059 (Pixabay Content License) | near top-down | busy lane pool, many lap swimmers |

## Results

| Clip | Virtual time | Frames | Avg people detected | False alarms | Max stillness s | Motion median (torso/s) | Noise floor max |
|---|---|---|---|---|---|---|---|
| floats | 42.9 s (3 loops) | 645 | **1.4** (of 2 real) | **0** | 0.0 | 2.409 | 3.974 |
| nightpool | 50.7 s (3 loops) | 762 | **0.0** (dozens real) | 0 | — | — | — |
| lanepool | 45.1 s (2 loops) | 678 | **0.0** (many real) | 0 | — | — | — |

**Probes (single frame, lanepool t=8s):** MoveNet full-frame 0 people · MoveNet at
2.9× zoom crop 0 · COCO-SSD full-frame 0. **Control (floats t=5s):** COCO-SSD
finds both children (scores 0.93, 0.46).

## Findings

1. **Swimmers IN water are essentially invisible to stock detectors.** Two
   architecturally different COCO-trained models (pose + object detection) both
   report zero persons across a pool full of active lap swimmers, at full frame
   AND zoomed. The same models find dry bodies on floats in the same water
   instantly. It is not the angle, not the resolution, not the water surface —
   it is the appearance of a partially submerged human. **Fine-tuning on
   swimmer data is not an enhancement; it is the critical path.** (Candidate
   starting point: the public Roboflow swimmer dataset, 4,481 annotated images.)
2. **Night + artificial light = total detection blackout.** 762 frames of a
   crowded night pool produced zero detections. "Detection rate by lighting" is
   a first-class published metric for a reason; as of v0.4 the honest number for
   night operation is 0%.
3. **When detection does work on hard poses, keypoint noise swamps the stillness
   metric.** The float kids — motionless to a human eye — measured a median
   apparent limb motion of 2.4 torso-lengths/second, 13× the stillness threshold,
   with a per-track noise floor peaking at 3.97. From extreme overhead, a real
   face-down floater would not read as still either. The adaptive-floor design
   surfaced this exactly as intended (it is why the noise floor is a logged CSV
   column) — and it says the blueprint's mounting guidance (elevated oblique,
   45–70°, NOT straight down) is likely load-bearing for the whole product.
4. **Zero false alarms across ~139 virtual seconds — reported with its honest
   caveat.** On the floats clip this is a meaningful negative result (the
   detector held both kids and still didn't alarm, thanks to the adaptive cap).
   On the other two clips it is vacuous: a system that sees nobody can't
   false-alarm. False-alarm rate is only measurable where detection works.
5. **Tracker robustness held:** detection flicker on the floats clip (1–2 people)
   was absorbed by the grace window + reacquire logic with zero spurious
   track-lost alarms across all 2,085 frames.

## What this changes

- **v0.5 priority is detection, not triggers.** The trigger logic (stillness /
  track-lost / churn) is unit-tested and behaved correctly everywhere the
  detector gave it input. The input is the bottleneck.
- The **rescue-clip tests** (elevated oblique wavepool footage — the angle
  Pharos actually targets) are now the key open question: does detection work
  at the blueprint's recommended geometry? Run via screen capture per
  `research/test-footage-rescues.md`.
- These three clips join the regression set: any future fine-tuned detector must
  beat avgPeople 1.4 / 0.0 / 0.0 on the same frames under the same harness.

*Attribution: "Outdoor pool at night" by Almanta, Wikimedia Commons, CC BY-SA 4.0.
Pexels/Pixabay clips used under their respective licenses for benchmarking only —
their ToS prohibit ML training use; neither clip will ever be used as training data.*
