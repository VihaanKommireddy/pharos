# Pharos detector fine-tune

**Goal:** make Pharos actually *see* people in water. Stock MoveNet can't (confirmed
three ways: the licensed pool clips, the live lane-pool run, and real rescue CCTV).
This folder is everything needed to fix that — decisions locked, dataset verified,
a runnable Colab notebook, and the eval that turns it into a published number.

Full research behind each decision is in the shared team folder:
`research/finetune-dataset-scout.md`, `finetune-method.md`, `finetune-eval-spec.md`.

---

## The three decisions (locked 2026-08-13)

### 1. What we fine-tune → **a YOLO detector, NOT MoveNet**
MoveNet ships frozen — Google released no training code and TF Hub flags it as
not fine-tunable. And the immediate failure isn't bad *pose*, it's not finding the
person *at all*. So we fine-tune a small **YOLO11-nano** object detector on swimmer
bounding boxes. `yolo11n` is tiny enough for a phone and trains in ~2–4h on a free GPU.

### 2. Architecture → **Option B: boxes + box-motion stillness (build this first)**
The tempting version (Option A) is YOLO to find each swimmer, then run MoveNet pose
inside each box to keep the keypoints the stillness metric uses. **We're not doing
that first**, for a real reason the research surfaced: MoveNet's keypoints on a
half-submerged, refraction-distorted, splash-occluded body are unreliable *even
with a perfect crop* — so Option A inherits a pose-quality problem we can't fix.
Option B computes stillness straight from the box (centroid drift, box-size/aspect
change, in-box motion-energy) — **no limbs needed, degrades gracefully in exactly
the water conditions where keypoints fall apart**, and it's one model instead of
YOLO-plus-a-MoveNet-per-swimmer on a fanless phone. Option A becomes an optional
v2 refinement for swimmers clearly at the surface.

> ⚠️ Consequence, stated honestly: a box detector improves **detection** (stage 1)
> and unlocks tracking + the track-lost trigger. The current keypoint-based
> stillness "brain" will need a box-based rewrite. Scope the published claim to
> detection until that's done.

### 3. How it runs in the browser → **ONNX + onnxruntime-web**
YOLO→TF.js conversion is historically finicky (NMS/op-support breakage). YOLO→ONNX
run via `onnxruntime-web` (WebGPU with a WASM fallback) is the dependable path, and
it coexists on the same page as the TF.js MoveNet. Export `format="onnx", opset=12`.

---

## Dataset (verified, licensed, $0)

| Dataset | Images | License | Angle | Use |
|---|---|---|---|---|
| **ecl / swimmers-detection** | 941 | **Public Domain** | above-water elevated pool | base |
| **swimmingdetection / swimmer-detection** | 1,131 | CC BY 4.0 | above-water elevated pool | base (merge) |
| Maritime / swimmer | 4,481 | CC BY 4.0 | **top-down but open OCEAN** | supplement only |
| figshare Underwater Drowning | 5,613 | CC BY 4.0 (no signup) | underwater | wrong angle — skip for now |

**Honest gap:** no free dataset exists of a true top-down *pool* cam with boxed
people. The licensed pool sets are elevated-oblique competition-swim footage —
close to our geometry, not identical. Plan to hand-label a few hundred frames of
**our own overhead pool footage** later to nail the exact mount. Still $0.

⚠️ **The Roboflow sets need a free Roboflow account (email signup, no card).** That
bumps the "never sign up" rule — but this is the *build* phase, not research, and
it's genuinely free. **Vihaan's call.** No-signup alternative: manually download a
set and upload the zip to Colab (the notebook supports both).

🚫 **Never train on `testdata/*`** (the eval clips) or on any real-rescue footage.

---

## Run it (≈ your part is ~5 clicks + a wait)

1. Open `train_pharos_detector.ipynb` in **Google Colab** (colab.research.google.com
   → File → Upload notebook).
2. **Runtime → Change runtime type → T4 GPU.**
3. Run the cells top to bottom. When it asks for a Roboflow API key, paste yours
   (free account → Settings → API key), *or* switch to the upload-a-zip cell.
4. Training runs ~2–4h. Don't let the tab go idle >90 min. It checkpoints every epoch.
5. The last cell downloads `pharos-swimmer.onnx`. Drop it into the app, run the
   before/after eval (`benchmarks/detect-bench.html`), publish the delta.

## Then measure (the whole point)
Follow `research/finetune-eval-spec.md`: pre-register thresholds, hand-label ~25–30
anchor frames for In-Water Swimmer Recall, run stock vs fine-tuned through the frozen
`detect-bench.html`, report per clip with confidence intervals. A clean **0% → X%**
is publishable even if X is small — nobody publishes in-water recall across pools at all.
