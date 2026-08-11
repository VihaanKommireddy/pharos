// The measurement harness — Blueprint §7. "The defensible claim is made or
// lost here." Per-frame rows, per-alarm rows, session metadata, CSV export.
// Pure logic — no DOM.

export class SessionLog {
  constructor(cfg) {
    this.cfg = cfg;
    this.sessionId = 's' + Math.random().toString(36).slice(2, 8);
    this.frames = [];
    this.alarms = [];
    this.meta = {};
    this.startedAt = null;
    this.operatingSeconds = 0; // the denominator people forget (§7.3)
    this.frameCounter = 0;
    this.truncated = false;
  }

  setMeta(meta) { this.meta = { ...this.meta, ...meta }; }

  start(nowIso) { this.startedAt = nowIso; }

  tick(dt) { this.operatingSeconds += dt; }

  logFrame(t, people) {
    this.frameCounter++;
    if (this.frameCounter % this.cfg.LOG_EVERY_N_FRAMES !== 0) return;
    if (this.frames.length >= this.cfg.MAX_LOG_ROWS) { this.truncated = true; return; }
    for (const p of people) {
      this.frames.push({
        t: +t.toFixed(3), session: this.sessionId, track: p.id,
        cx: Math.round(p.x), cy: Math.round(p.y), torso: +(p.torso || 0).toFixed(1),
        motion: p.motion === null || p.motion === undefined ? '' : +p.motion.toFixed(5),
        noise_floor: p.noise === null || p.noise === undefined ? '' : +p.noise.toFixed(5),
        still_s: +p.stillS.toFixed(2),
        in_region: p.inRegion ? 1 : 0, near_edge: p.nearEdge ? 1 : 0,
        struggle: p.struggle ? 1 : 0, churn: p.churn ? 1 : 0, state: p.state,
      });
    }
  }

  logAlarm(alarm) {
    this.alarms.push({
      t: +alarm.t.toFixed(2), session: this.sessionId,
      track: alarm.trackId, trigger: alarm.trigger,
      label: alarm.label || 'unlabeled', cause: alarm.cause || '',
      time_to_alert_s: alarm.timeToAlertS === undefined ? '' : alarm.timeToAlertS,
    });
  }

  // Attach the on-the-spot label (§7.2: labeled at the pool, not from memory).
  // BUG #3: label the SPECIFIC alarm being acknowledged, matched by time +
  // track + trigger — "label the last one" mislabels when a second alarm
  // arrives between overlay and tap.
  labelAlarm(match, label, cause) {
    const a = this.alarms.find((r) =>
      r.track === match.trackId && r.trigger === match.trigger && Math.abs(r.t - match.t) < 0.1);
    if (a) { a.label = label; a.cause = cause || a.cause; return true; }
    return false;
  }

  labelLastAlarm(label, cause) {
    const a = this.alarms[this.alarms.length - 1];
    if (a) { a.label = label; a.cause = cause || a.cause; }
  }

  falseAlarmsPerHour() {
    const fp = this.alarms.filter((a) => a.label === 'false_positive').length;
    const hours = this.operatingSeconds / 3600;
    return hours > 0 ? fp / hours : null;
  }

  toFramesCSV() { return toCSV(this.frames); }
  toAlarmsCSV() { return toCSV(this.alarms); }

  toMetaText(config) {
    return [
      `session=${this.sessionId}`,
      `started=${this.startedAt}`,
      `operating_seconds=${Math.round(this.operatingSeconds)}`,
      `frames_logged=${this.frames.length}${this.truncated ? ' (TRUNCATED at cap)' : ''}`,
      `alarms=${this.alarms.length}`,
      `false_alarms_per_hour=${this.falseAlarmsPerHour() ?? 'n/a'}`,
      ...Object.entries(this.meta).map(([k, v]) => `${k}=${v}`),
      '--- config (every parameter, per Blueprint §6.5) ---',
      ...Object.entries(config).map(([k, v]) => `${k}=${v}`),
    ].join('\n');
  }
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
