/* ===== audio.js 音乐与音效管理（本地素材 + WebAudio 合成兜底） ===== */
window.SD = window.SD || {};

SD.AudioMan = {
  ctx: null,
  muted: false,
  musicEl: null,
  curMusic: null,

  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  decode(url) {
    // 6 秒超时兜底，任何资源异常都不能卡死加载
    return Promise.race([
      new Promise((resolve) => {
        this.ensure();
        if (!this.ctx) return resolve(null);
        fetch(url).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
          .then(ab => new Promise(res2 => {
            // decodeAudioData 回调某些情况下不触发，再包一层超时
            const timer = setTimeout(() => res2(null), 4000);
            this.ctx.decodeAudioData(ab,
              buf => { clearTimeout(timer); res2(buf); },
              () => { clearTimeout(timer); res2(null); });
          }))
          .then(buf => resolve(buf))
          .catch(() => resolve(null));
      }),
      new Promise(res => setTimeout(() => res(null), 6000)),
    ]);
  },

  /** 播放音效：优先真实素材，缺失时按类别合成 */
  play(name, opt) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;
    const vol = (opt && opt.vol) || 1;
    const list = SD.buffers[name];
    if (list && list.length) {
      const buf = list[(Math.random() * list.length) | 0];
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.92 + Math.random() * 0.16;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(g).connect(this.ctx.destination);
      src.start();
      return;
    }
    this.synth(name, vol);
  },

  /** 合成兜底：用噪声/振荡器模拟各类音效 */
  synth(name, vol) {
    const ctx = this.ctx, t = ctx.currentTime;
    const noise = (dur, freq, q, v) => {
      const len = ctx.sampleRate * dur;
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ctx.createBufferSource(); s.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = v;
      s.connect(f).connect(g).connect(ctx.destination); s.start(t);
    };
    const tone = (type, f0, f1, dur, v) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
    };
    switch (name) {
      case 'swing':  noise(0.14, 900, 1.2, 0.35 * vol); break;
      case 'hit':    noise(0.12, 300, 1, 0.7 * vol); tone('square', 160, 60, 0.1, 0.3 * vol); break;
      case 'clash':  noise(0.18, 2600, 6, 0.5 * vol); tone('triangle', 1900, 1200, 0.15, 0.2 * vol); break;
      case 'crit':   noise(0.2, 500, 1, 0.8 * vol); tone('sawtooth', 300, 50, 0.25, 0.4 * vol); break;
      case 'jump':   tone('sine', 300, 620, 0.14, 0.22 * vol); break;
      case 'land':   noise(0.08, 200, 1, 0.3 * vol); break;
      case 'coin':   tone('square', 900, 1400, 0.09, 0.22 * vol); tone('square', 1400, 1900, 0.14, 0.15 * vol); break;
      case 'chest':  tone('triangle', 400, 900, 0.3, 0.3 * vol); break;
      case 'explode':noise(0.5, 150, 0.6, 0.9 * vol); tone('sine', 90, 30, 0.4, 0.5 * vol); break;
      case 'skill':  noise(0.2, 1400, 2, 0.4 * vol); tone('sawtooth', 500, 900, 0.15, 0.2 * vol); break;
      case 'super':  tone('sawtooth', 200, 800, 0.4, 0.35 * vol); noise(0.4, 700, 1, 0.5 * vol); break;
      case 'win':    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone('triangle', f, f, 0.25, 0.3 * vol), i * 110)); break;
      default:       noise(0.1, 600, 1, 0.3 * vol);
    }
  },

  /** 播放背景音乐（循环）；文件缺失时静默 */
  music(key) {
    if (this.curMusic === key) return;
    this.curMusic = key;
    if (this.musicEl) { this.musicEl.pause(); this.musicEl = null; }
    // 内置曲目已移除，背景音乐由独立的四首歌播放器管理。
    if (!key || !SD.ASSETS.music || !SD.ASSETS.music[key]) return;
    const el = new Audio(SD.ASSETS.music[key]);
    el.loop = true; el.volume = 0.55;
    const result = el.play();
    if (result && result.catch) result.catch(function () {});
    this.musicEl = el;
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.musicEl) this.musicEl.muted = this.muted;
    var playlist = document.getElementById('playlistAudio');
    if (playlist) playlist.muted = this.muted;
    return this.muted;
  }
};
