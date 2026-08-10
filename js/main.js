// Pharos Free — app wiring. State machine:
// LOADING -> READY (preflight) -> source running -> ZONED (trace done) -> ARMED -> (ALARM)
//
// Patent design rules (research/patent-US11216654B2.md) enforced here:
//   1. The trace is mandatory — there is no skip path.
//   2. No auto-detect fallback of the pool region exists anywhere in this codebase.
//   3. ARM stays disabled until the operator has defined the zone.

import { CONFIG, DEMO_OVERRIDES } from './config.js';
import { Tracker } from './tracker.js';
import { StillnessEngine } from './stillness.js';
import { SessionLog } from './logger.js';
import { AlarmController } from './alarm.js';
import { createRealDetector, createDemoDetector, DEMO_ZONE, DEMO_PX_PER_METER } from './detector.js';

const $ = (id) => document.getElementById(id);
const video = $('cam'), canvas = $('view'), ctx = canvas.getContext('2d');

let cfg = { ...CONFIG };
let detector = null;
let sourceKind = null;      // 'camera' | 'demo'
let tracker = null;
let engine = null;
let log = null;
let alarms = null;
let zone = null;            // [{x,y}] in canvas coordinates
let pxPerMeter = null;
let armed = false;
let tracing = false;
let scaleTaps = null;
let t0 = null, lastT = null, lastFrameMs = null, fpsEma = null;
let busy = false;
let wakeLock = null;
let demoStartMs = null;
let lastLoopMs = 0;
let hiddenAtMs = null;

// BUG #2 (BUILD-LOG.md): requestAnimationFrame pauses in background tabs and
// under a locked screen — a safety monitor must never freeze silently. This
// watchdog keeps the loop breathing (browsers throttle timers to ~1/s in
// background, degraded but alive), and the visibility handler makes any gap
// loud and logged instead of invisible.
setInterval(() => {
  if (detector && !busy && performance.now() - lastLoopMs > 600) renderLoop();
}, 300);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAtMs = performance.now();
  } else if (hiddenAtMs !== null) {
    const gapS = (performance.now() - hiddenAtMs) / 1000;
    hiddenAtMs = null;
    if (armed && gapS > 2) {
      hint(`⚠ Monitoring was degraded for ${gapS.toFixed(0)}s while the app was in the background. ` +
        'Keep Pharos in the foreground with the screen on.');
      log?.setMeta({ ['gap_at_' + Math.round(performance.now() / 1000)]: gapS.toFixed(1) + 's_backgrounded' });
    }
  }
});

// ---------- preflight (Blueprint §2.2 — check everything before starting) ----------
const checks = {
  secure: { label: 'Secure context (HTTPS or localhost)', state: 'pending' },
  tfjs: { label: 'TensorFlow.js loaded', state: 'pending' },
  posedet: { label: 'Pose-detection library loaded', state: 'pending' },
  model: { label: 'MoveNet model loads', state: 'pending' },
  cameraAvail: { label: 'A camera exists on this device', state: 'pending' },
  wake: { label: 'Screen wake-lock supported', state: 'pending' },
  storage: { label: 'localStorage for the traced zone', state: 'pending' },
};

function renderPreflight() {
  $('preflight').innerHTML = Object.values(checks).map((c) => {
    const cls = c.state === 'ok' ? 'ok' : c.state === 'fail' ? 'bad' : c.state === 'warn' ? 'warn' : '';
    const mark = c.state === 'ok' ? '✓' : c.state === 'fail' ? '✗' : c.state === 'warn' ? '△' : '…';
    return `<div class="check"><span>${c.label}</span><span class="${cls}">${mark}</span></div>`;
  }).join('');
}

async function preflight() {
  checks.secure.state = window.isSecureContext ? 'ok' : 'fail';
  checks.tfjs.state = typeof window.tf !== 'undefined' ? 'ok' : 'fail';
  checks.posedet.state = typeof window.poseDetection !== 'undefined' ? 'ok' : 'fail';
  checks.wake.state = 'wakeLock' in navigator ? 'ok' : 'warn';
  try { localStorage.setItem('_pf', '1'); localStorage.removeItem('_pf'); checks.storage.state = 'ok'; }
  catch { checks.storage.state = 'warn'; }
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    checks.cameraAvail.state = devs.some((d) => d.kind === 'videoinput') ? 'ok' : 'warn';
  } catch { checks.cameraAvail.state = 'warn'; }
  renderPreflight();
  // Model load test (also warms the cache so ARM is instant later).
  try {
    if (checks.tfjs.state === 'ok' && checks.posedet.state === 'ok') {
      const d = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING });
      await d.dispose?.();
      checks.model.state = 'ok';
    } else checks.model.state = 'fail';
  } catch (e) { checks.model.state = 'fail'; }
  renderPreflight();
  const core = [checks.secure, checks.tfjs, checks.posedet].every((c) => c.state === 'ok');
  setState(core ? 'ready — pick a source' : 'preflight failed');
  $('startSource').disabled = !core;
}

// ---------- UI helpers ----------
function setState(s, armedFlag = false) {
  const el = $('state');
  el.textContent = s;
  el.className = armedFlag ? 'armed' : '';
}
function hint(msg) {
  const el = $('hint');
  if (msg) { el.textContent = msg; el.style.display = 'block'; }
  else el.style.display = 'none';
}
function zoneKey() {
  return `pharos-zone-${sourceKind}-${canvas.width}x${canvas.height}`;
}
function updateZoneUI() {
  const ok = zone && zone.length >= 3;
  $('zoneStatus').textContent = ok
    ? `zone: ${zone.length} points · scale: ${pxPerMeter ? pxPerMeter.toFixed(1) + ' px/m' : 'not set (optional)'}`
    : 'no zone traced';
  $('armBtn').disabled = !(ok && detector); // patent rule 3: no zone, no arm
  $('clearTrace').disabled = !ok;
}

// ---------- source ----------
$('startSource').onclick = async () => {
  sourceKind = $('source').value;
  $('startSource').disabled = true;
  try {
    if (sourceKind === 'camera') {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'environment' } });
      video.srcObject = stream;
      await new Promise((r) => (video.onloadedmetadata = r));
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      detector = await createRealDetector(video);
      $('demoZone').style.display = 'none';
    } else {
      canvas.width = 1280; canvas.height = 720;
      detector = createDemoDetector();
      cfg = { ...CONFIG, ...DEMO_OVERRIDES };
      demoStartMs = performance.now();
      $('demoZone').style.display = 'inline-block';
    }
    $('traceBtn').disabled = false;
    $('scaleBtn').disabled = false;
    // Restore a previously traced zone for this source+resolution, if any.
    try {
      const saved = JSON.parse(localStorage.getItem(zoneKey()) || 'null');
      if (saved && saved.zone) { zone = saved.zone; pxPerMeter = saved.pxPerMeter; }
    } catch { /* corrupted save — trace again */ }
    updateZoneUI();
    setState(sourceKind === 'camera' ? 'camera live — trace the pool' : 'demo loaded — trace or load demo zone');
    renderLoop();
  } catch (e) {
    setState('source failed: ' + e.message);
    $('startSource').disabled = false;
  }
};

// ---------- trace (mandatory zone) ----------
$('traceBtn').onclick = () => {
  tracing = true; zone = []; pxPerMeter = null;
  $('finishTrace').style.display = 'inline-block';
  hint('Tap around the water\'s edge. At least 3 points. Then "Finish trace".');
  updateZoneUI();
};
$('finishTrace').onclick = () => {
  tracing = false;
  $('finishTrace').style.display = 'none';
  if (zone && zone.length >= 3) {
    localStorage.setItem(zoneKey(), JSON.stringify({ zone, pxPerMeter }));
    hint(null);
  } else {
    zone = null;
    hint('Need at least 3 points — tap "Trace pool edge" and try again.');
  }
  updateZoneUI();
};
$('clearTrace').onclick = () => {
  zone = null; pxPerMeter = null; tracing = false;
  localStorage.removeItem(zoneKey());
  updateZoneUI();
};
$('demoZone').onclick = () => {
  // Demo zone is still an explicit operator action — the system never
  // self-defines its operating zone (patent rule 2).
  zone = DEMO_ZONE.map((p) => ({ ...p }));
  pxPerMeter = DEMO_PX_PER_METER;
  localStorage.setItem(zoneKey(), JSON.stringify({ zone, pxPerMeter }));
  updateZoneUI();
};
$('scaleBtn').onclick = () => {
  scaleTaps = [];
  hint('Tap the two ends of a lane line (or any known length) in the picture.');
};

function canvasPoint(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) * (canvas.width / r.width),
    y: (ev.clientY - r.top) * (canvas.height / r.height),
  };
}
canvas.addEventListener('click', (ev) => {
  const p = canvasPoint(ev);
  if (tracing) { zone = zone || []; zone.push(p); updateZoneUI(); return; }
  if (scaleTaps) {
    scaleTaps.push(p);
    if (scaleTaps.length === 2) {
      const d = Math.hypot(scaleTaps[0].x - scaleTaps[1].x, scaleTaps[0].y - scaleTaps[1].y);
      const meters = parseFloat(prompt('Real length of that line, in meters:', '25') || '0');
      if (meters > 0) {
        pxPerMeter = d / meters;
        if (zone) localStorage.setItem(zoneKey(), JSON.stringify({ zone, pxPerMeter }));
      }
      scaleTaps = null;
      hint(null);
      updateZoneUI();
    }
  }
});

// ---------- arm / disarm ----------
$('armBtn').onclick = async () => {
  if (!zone || zone.length < 3) return; // belt and braces: no zone, no arm
  tracker = new Tracker(cfg);
  engine = new StillnessEngine(cfg);
  engine.setZone(zone, pxPerMeter);
  log = new SessionLog(cfg);
  log.start(new Date().toISOString());
  log.setMeta({
    source: sourceKind, detector: detector.label,
    pool: $('metaPool').value || '(unnamed)',
    resolution: `${canvas.width}x${canvas.height}`,
    zone_points: zone.length, px_per_meter: pxPerMeter || 'unset',
  });
  alarms = new AlarmController(cfg);
  alarms.ntfyTopic = $('ntfyTopic').value.trim();
  alarms.onchange = (a) => {
    $('alarmOverlay').className = a ? 'show' : '';
    if (a) $('alarmMsg').textContent =
      a.trigger === 'track_lost'
        ? `Swimmer (track ${a.trackId}) disappeared underwater ${Math.round(a.lostForS || 0)}s ago and has not come back up.`
        : `Swimmer (track ${a.trackId}) has not moved for ${Math.round(a.stillS || 0)} seconds.`;
  };
  armed = true;
  t0 = null; lastT = null;
  if (sourceKind === 'demo') demoStartMs = performance.now(); // demo replays from t=0 on arm
  $('armBtn').disabled = true;
  $('disarmBtn').disabled = false;
  setState('ARMED — watching', true);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
};
$('disarmBtn').onclick = () => {
  armed = false;
  alarms?.acknowledge('unclear', 'disarmed');
  $('armBtn').disabled = false;
  $('disarmBtn').disabled = true;
  setState('disarmed');
  wakeLock?.release?.();
};

// ---------- alarm acknowledgement ----------
$('ackReal').onclick = () => ackAlarm('true_positive');
$('ackFalse').onclick = () => {
  const cause = prompt('Cause? (resting on wall / glare / handstand / merged tracks / other)', '') || '';
  ackAlarm('false_positive', cause);
};
function ackAlarm(label, cause) {
  const acked = alarms.acknowledge(label, cause);
  if (acked && log) log.labelAlarm(acked, label, cause); // label by identity, not recency (Bug #3)
  renderAlarmTable();
}

// ---------- exports ----------
function download(name, text, mime = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
$('exportFrames').onclick = () => log && download(`pharos-${log.sessionId}-frames.csv`, log.toFramesCSV());
$('exportAlarms').onclick = () => log && download(`pharos-${log.sessionId}-alarms.csv`, log.toAlarmsCSV());
$('exportMeta').onclick = () => log && download(`pharos-${log.sessionId}-session.txt`, log.toMetaText(cfg), 'text/plain');

// ---------- render loop ----------
const EDGES = [[0,1],[0,2],[1,3],[2,4],[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]];

async function renderLoop() {
  if (busy) return; // never overlap async detections
  busy = true;
  try {
    const nowMs = performance.now();
    lastLoopMs = nowMs;
    const t = sourceKind === 'demo' ? (nowMs - demoStartMs) / 1000 : nowMs / 1000;
    const dets = await detector.detect(t);

    // draw base
    if (sourceKind === 'camera') ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    else { ctx.fillStyle = '#0a2a3f'; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    // zone
    const zonePts = tracing || zone ? (tracing ? zone : zone) : null;
    if (zonePts && zonePts.length) {
      ctx.beginPath();
      zonePts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (!tracing) ctx.closePath();
      ctx.strokeStyle = '#4aa8ff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(74,168,255,0.08)'; if (!tracing) ctx.fill();
    }

    let people = [];
    if (armed && tracker && engine) {
      const dt = lastT === null ? 1 / 30 : Math.max(0.001, t - lastT);
      lastT = t;
      const { active, lostNow } = tracker.update(dets, t);
      const res = engine.update(active, lostNow, t, dt);
      people = res.people;
      log.tick(dt);
      log.logFrame(t, people);
      for (const alarm of res.alarmsNow) {
        log.logAlarm(alarm);
        alarms.raise(alarm);
        renderAlarmTable();
      }
      // skeleton overlay from live tracks
      for (const tr of active) {
        const p = people.find((x) => x.id === tr.id);
        const color = !p?.inRegion ? '#5a6d80' : p.stillS > p.threshold * 0.6 ? '#ff5c5c'
          : p.struggle ? '#ffc53d' : '#39d98a';
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
        for (const [a, b] of EDGES) {
          const ka = tr.keypoints[a], kb = tr.keypoints[b];
          if (ka.score >= cfg.KEYPOINT_MIN_SCORE && kb.score >= cfg.KEYPOINT_MIN_SCORE) {
            ctx.beginPath(); ctx.moveTo(ka.x, ka.y); ctx.lineTo(kb.x, kb.y); ctx.stroke();
          }
        }
        ctx.font = 'bold 16px system-ui';
        ctx.fillText(`#${tr.id}${p && p.inRegion ? ` ${p.stillS.toFixed(0)}s` : ''}`,
          tr.centroid.x + 10, tr.centroid.y - 10);
      }
    } else {
      // not armed: raw detections as dots so trace/scale still has feedback
      ctx.fillStyle = '#39d98a';
      for (const d of dets) for (const kp of d.keypoints) {
        if (kp.score >= cfg.KEYPOINT_MIN_SCORE) { ctx.beginPath(); ctx.arc(kp.x, kp.y, 4, 0, 7); ctx.fill(); }
      }
    }

    // trace handles on top
    if (tracing && zone) {
      ctx.fillStyle = '#ffc53d';
      for (const p of zone) { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill(); }
    }

    renderTracksTable(people);
    // Bug #4: watchdog + rAF racing gives near-zero deltas — smooth and clamp.
    if (lastFrameMs && nowMs - lastFrameMs > 1) {
      const inst = 1000 / (nowMs - lastFrameMs);
      fpsEma = fpsEma ? fpsEma * 0.9 + inst * 0.1 : inst;
      $('fps').textContent = `${Math.min(Math.round(fpsEma), 120)} fps`;
    }
    lastFrameMs = nowMs;
    if (log) $('sessionStats').textContent =
      `session ${log.sessionId} · ${Math.round(log.operatingSeconds)}s · ` +
      `${log.frames.length} rows · ${log.alarms.length} alarms · ` +
      `FA/hr: ${log.falseAlarmsPerHour() === null ? '—' : log.falseAlarmsPerHour().toFixed(2)}`;
  } catch (e) {
    setState('error: ' + e.message);
  } finally {
    busy = false;
    requestAnimationFrame(renderLoop);
  }
}

function renderTracksTable(people) {
  const tb = $('tracksTable').querySelector('tbody');
  tb.innerHTML = people.map((p) => `<tr>
    <td>#${p.id}</td>
    <td>${p.inRegion ? '✓' : '—'}</td>
    <td>${p.motion === null ? '…' : p.motion.toFixed(4)}</td>
    <td class="${p.stillS > p.threshold * 0.6 ? 'bad' : ''}">${p.stillS.toFixed(1)}</td>
    <td>${p.threshold}s${p.nearEdge ? ' (edge)' : ''}</td>
    <td>${[p.struggle ? '⚠ struggle' : '', p.churn ? '⚠ bobbing' : ''].filter(Boolean).join(' ')}</td>
  </tr>`).join('');
}
function renderAlarmTable() {
  const tb = $('alarmTable').querySelector('tbody');
  tb.innerHTML = (log?.alarms || []).slice(-8).reverse().map((a) => `<tr>
    <td>${a.t}s</td><td>#${a.track}</td><td>${a.trigger}</td><td>${a.label}</td>
  </tr>`).join('');
}

// ---------- boot ----------
renderPreflight();
preflight();
setState('preflight…');
