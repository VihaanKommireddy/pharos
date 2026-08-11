// Alarm delivery: siren that repeats until acknowledged, fullscreen overlay,
// optional push to a second phone via ntfy.sh, and a one-tap CALL 911 link.
//
// Why there is no automatic 911 call: browsers cannot place phone calls —
// tel: links legally require a human tap. And every commercial system in this
// industry excludes auto-911 deliberately: a false alarm that dials emergency
// services is how a safety product becomes a banned product. The alarm's job
// is to make a HUMAN look at the water in under 3 seconds.

export class AlarmController {
  constructor(cfg) {
    this.cfg = cfg;
    this.activeAlarm = null;
    this.queue = []; // BUG #3: a second alarm during an active one must queue, not vanish
    this.audioCtx = null;
    this._beepTimer = null;
    this._ntfyTimer = null;
    this.ntfyTopic = '';
    this.onchange = () => {};
  }

  // Review #13: an AudioContext created outside a user gesture starts
  // 'suspended' and the siren silently never plays. ensureAudio() is called
  // from the ARM click (a real gesture) AND before every beep, resuming if
  // needed — and armTest() plays an audible confirmation at arm time so a
  // broken audio path is discovered before anyone is in the water.
  ensureAudio() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    return this.audioCtx;
  }

  armTest() {
    try {
      const ctx = this.ensureAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
      return true;
    } catch (e) { return false; }
  }

  _beep() {
    try {
      const ctx = this.ensureAudio();
      const now = ctx.currentTime;
      // Two-tone siren burst, impossible to mistake for a notification chirp.
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = i % 2 ? 950 : 700;
        gain.gain.setValueAtTime(0.5, now + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.22 + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.22);
        osc.stop(now + i * 0.22 + 0.21);
      }
    } catch (e) { /* audio blocked until first user gesture — overlay still shows */ }
  }

  async _push(body) {
    if (!this.ntfyTopic) return;
    try {
      await fetch('https://ntfy.sh/' + encodeURIComponent(this.ntfyTopic), {
        method: 'POST',
        body,
        headers: { Title: 'PHAROS ALARM', Priority: 'urgent', Tags: 'rotating_light' },
      });
    } catch (e) { /* offline: local siren still runs */ }
  }

  raise(alarm) {
    if (this.activeAlarm) { this.queue.push(alarm); return; } // shown next, in order
    this.activeAlarm = { ...alarm, raisedAtMs: Date.now() };
    try { navigator.vibrate?.([400, 150, 400, 150, 800]); } catch (e) { /* desktop */ }
    this._beep();
    this._beepTimer = setInterval(() => this._beep(), this.cfg.ALARM_REBEEP_S * 1000);
    const msg = `Pharos: ${alarm.trigger === 'track_lost' ? 'swimmer LOST from view' : 'swimmer STILL'} ` +
      `(track ${alarm.trackId}) — CHECK THE WATER NOW`;
    this._push(msg);
    this._ntfyTimer = setInterval(() => this._push(msg + ' (unacknowledged)'), this.cfg.NTFY_REPEAT_S * 1000);
    this.onchange(this.activeAlarm);
  }

  // label: 'false_positive' | 'true_positive' | 'unclear'
  acknowledge(label, cause) {
    if (!this.activeAlarm) return null;
    clearInterval(this._beepTimer);
    clearInterval(this._ntfyTimer);
    const ack = { ...this.activeAlarm, label, cause };
    this.activeAlarm = null;
    this.onchange(null);
    const next = this.queue.shift();
    if (next) this.raise(next); // the queued emergency gets its own overlay + siren
    return ack;
  }
}
