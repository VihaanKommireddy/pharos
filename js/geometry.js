// Pure geometry helpers. No DOM, no TensorFlow — unit-testable in Node.

// Ray-casting point-in-polygon. poly = [{x,y}, ...]
export function pointInPolygon(pt, poly) {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersects = (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Shortest distance from a point to the polygon boundary.
export function distToPolygonEdge(pt, poly) {
  if (!poly || poly.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    min = Math.min(min, distToSegment(pt, poly[j], poly[i]));
  }
  return min;
}

export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Centroid of the trusted keypoints of one pose.
export function poseCentroid(keypoints, minScore) {
  let sx = 0, sy = 0, n = 0;
  for (const kp of keypoints) {
    if (kp.score >= minScore) { sx += kp.x; sy += kp.y; n++; }
  }
  return n ? { x: sx / n, y: sy / n, n } : null;
}

// Torso length in pixels: mean shoulder to mean hip. This is the scale
// normalizer (Blueprint §6.2) — a person far from the camera moves fewer
// pixels for the same real movement, so everything divides by this.
// MoveNet indices: 5=Lshoulder 6=Rshoulder 11=Lhip 12=Rhip.
export function torsoLength(keypoints, minScore) {
  const pick = (i) => (keypoints[i] && keypoints[i].score >= minScore ? keypoints[i] : null);
  const ls = pick(5), rs = pick(6), lh = pick(11), rh = pick(12);
  const mid = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a || b);
  const sh = mid(ls, rs), hp = mid(lh, rh);
  if (sh && hp) {
    const d = Math.hypot(sh.x - hp.x, sh.y - hp.y);
    if (d > 4) return d;
  }
  // Fallback: fraction of the trusted-keypoint bounding-box diagonal.
  const bb = poseBBox(keypoints, minScore);
  if (!bb) return null;
  const diag = Math.hypot(bb.w, bb.h);
  return diag > 4 ? diag * 0.35 : null;
}

export function poseBBox(keypoints, minScore) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
  for (const kp of keypoints) {
    if (kp.score >= minScore) {
      minX = Math.min(minX, kp.x); maxX = Math.max(maxX, kp.x);
      minY = Math.min(minY, kp.y); maxY = Math.max(maxY, kp.y);
      n++;
    }
  }
  return n >= 2 ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}
