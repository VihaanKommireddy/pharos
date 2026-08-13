#!/usr/bin/env python3
"""
Pharos swimmer-detector fine-tune — LOCAL, on the Mac's own GPU (Apple MPS).
No Colab, no cloud. Trains YOLO11-nano on swimmer boxes and exports ONNX for the browser.

Runs inside finetune/.venv (torch + ultralytics already installed there).

Usage:
  1. Vihaan downloads the two Roboflow datasets (YOLOv11 zips) to ~/Downloads.
  2. python train_local.py --zips ~/Downloads/ecl*.zip ~/Downloads/swimmer*.zip
     (or --dirs on already-unzipped folders)

It: unzips -> merges every swimmer-in-water class to a single class 0 ->
writes a data.yaml -> trains on MPS -> exports pharos-swimmer.onnx here.

NEVER point this at testdata/* (the eval clips) or any real-rescue footage.
"""
import argparse, glob, os, shutil, sys, zipfile
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
MERGED = os.path.join(HERE, "pharos_ds")

# Class names across the source datasets that mean "a person in/at the water".
# Everything else (umpire, hats worn on deck) is dropped.
KEEP = {"bodysurface", "bodyunder", "Relax", "human", "person in water", "swimmer", "Swimming"}


def unzip(zips):
    dirs = []
    for i, z in enumerate(zips):
        out = os.path.join(HERE, f"ds_{i}")
        os.makedirs(out, exist_ok=True)
        with zipfile.ZipFile(os.path.expanduser(z)) as f:
            f.extractall(out)
        dirs.append(out)
        print(f"unzipped {z} -> {out}")
    return dirs


def ingest(root):
    """Copy swimmer-labelled images into MERGED, remapping kept classes to id 0."""
    ymls = glob.glob(f"{root}/**/data.yaml", recursive=True)
    if not ymls:
        print("  no data.yaml under", root)
        return 0
    base = os.path.dirname(ymls[0])
    names = yaml.safe_load(open(ymls[0]))["names"]
    names = {i: n for i, n in (names.items() if isinstance(names, dict) else enumerate(names))}
    kept = 0
    for split in ["train", "valid", "val"]:
        for img in glob.glob(f"{base}/{split}/images/*"):
            stem = os.path.splitext(os.path.basename(img))[0]
            lbl = f"{base}/{split}/labels/{stem}.txt"
            dst = "val" if split in ("valid", "val") else "train"
            lines = []
            if os.path.exists(lbl):
                for ln in open(lbl):
                    p = ln.split()
                    if not p:
                        continue
                    if names.get(int(p[0]), "") in KEEP:
                        lines.append("0 " + " ".join(p[1:]))
            if lines:  # only keep frames that actually contain a swimmer
                shutil.copy(img, f"{MERGED}/images/{dst}/{stem}.jpg")
                open(f"{MERGED}/labels/{dst}/{stem}.txt", "w").write("\n".join(lines))
                kept += 1
    print(f"  {root}: kept {kept} swimmer frames")
    return kept


def build_dataset(dirs):
    if os.path.exists(MERGED):
        shutil.rmtree(MERGED)
    for sub in ["images/train", "images/val", "labels/train", "labels/val"]:
        os.makedirs(f"{MERGED}/{sub}", exist_ok=True)
    total = sum(ingest(d) for d in dirs)
    if total == 0:
        sys.exit("No swimmer frames found — check the zips are YOLOv11-format Roboflow exports.")
    yaml.safe_dump(
        {"path": MERGED, "train": "images/train", "val": "images/val", "nc": 1, "names": ["swimmer"]},
        open(f"{MERGED}/data.yaml", "w"),
    )
    ntr = len(glob.glob(f"{MERGED}/images/train/*"))
    nva = len(glob.glob(f"{MERGED}/images/val/*"))
    print(f"merged dataset: {ntr} train / {nva} val")
    if nva == 0:  # some exports put everything in train; carve a val split
        imgs = sorted(glob.glob(f"{MERGED}/images/train/*"))
        for p in imgs[:: max(1, len(imgs) // 10)][:max(1, len(imgs)//10)]:
            stem = os.path.splitext(os.path.basename(p))[0]
            shutil.move(p, f"{MERGED}/images/val/{os.path.basename(p)}")
            lp = f"{MERGED}/labels/train/{stem}.txt"
            if os.path.exists(lp):
                shutil.move(lp, f"{MERGED}/labels/val/{stem}.txt")
        print("  (carved a val split from train)")


def train(epochs, imgsz, batch):
    from ultralytics import YOLO
    model = YOLO("yolo11n.pt")
    model.train(
        data=f"{MERGED}/data.yaml",
        imgsz=imgsz, epochs=epochs, batch=batch, patience=15,
        device="mps",                 # the Mac's own GPU
        project=os.path.join(HERE, "runs"), name="pharos-swimmer", exist_ok=True,
    )
    best = model.trainer.best
    print("best weights:", best)
    onnx = YOLO(best).export(format="onnx", opset=12, imgsz=imgsz)
    dst = os.path.join(HERE, "pharos-swimmer.onnx")
    shutil.copy(onnx, dst)
    shutil.copy(str(best), os.path.join(HERE, "pharos-swimmer.pt"))
    print("\nDONE ->", dst)
    print("Next: wire pharos-swimmer.onnx into the app (onnxruntime-web) and run benchmarks/detect-bench.html before/after.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--zips", nargs="*", default=[], help="Roboflow YOLOv11 zip files")
    ap.add_argument("--dirs", nargs="*", default=[], help="already-unzipped dataset folders")
    ap.add_argument("--epochs", type=int, default=60)   # fanless Mac: keep it bounded; raise if it stays cool
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    a = ap.parse_args()
    dirs = list(a.dirs) + (unzip(a.zips) if a.zips else [])
    if not dirs:
        sys.exit("Give me --zips <files> or --dirs <folders>. See the header.")
    build_dataset(dirs)
    train(a.epochs, a.imgsz, a.batch)
