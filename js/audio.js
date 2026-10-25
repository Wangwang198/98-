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
      case 'gun_old': case 'gun_han': case 'gun_38': case 'gun_zz': case 'gun_k98':
      case 'gun_t44': case 'gun_smle': case 'gun_mosin': case 'gun_spring':
      case 'gun_nambu': case 'gun_webley': case 'gun_tt33': case 'gun_c96': case 'gun_1911':
      case 'gun_sten': case 'gun_mp28': case 'gun_ppsh': case 'gun_tommy':
        this.gunShot(name, vol); break;
      case 'bolt_open':  this.boltSound(true, vol); break;
      case 'bolt_close': this.boltSound(false, vol); break;
      case 'bullethit':
        noise(0.11, 420, 0.9, 0.75 * vol); tone('sine', 150, 48, 0.13, 0.5 * vol);
        tone('triangle', 2600, 1700, 0.1, 0.1 * vol); break;
      default:       noise(0.1, 600, 1, 0.3 * vol);
    }
  },

  /* ---------- 枪声合成 ----------
   * 一声枪响 = ①极短的高频"啪"(弹头破空/枪口爆燃) + ②中低频"砰"(火药爆燃) + ③低频闷响 + ④延迟的回声
   * 不同枪用不同参数：老套筒(黑火药时代的老枪,闷响拖尾长) < 汉阳造 < 三八式(小口径,声音尖脆) < 中正式 < 98K(最响最脆) */
  GUN_PROFILE: {
    gun_old: { crack: 1700, crackV: 0.55, crackD: 0.05, boom: 260, boomV: 0.95, boomD: 0.42, thump: [90, 34], thumpD: 0.34, thumpV: 0.75, echo: 0.16, echoV: 0.28 },
    gun_han: { crack: 2300, crackV: 0.75, crackD: 0.05, boom: 330, boomV: 0.9,  boomD: 0.36, thump: [105, 38], thumpD: 0.3,  thumpV: 0.7,  echo: 0.14, echoV: 0.26 },
    gun_38:  { crack: 3300, crackV: 0.85, crackD: 0.045, boom: 520, boomV: 0.7, boomD: 0.28, thump: [150, 55], thumpD: 0.2,  thumpV: 0.5,  echo: 0.12, echoV: 0.2 },
    gun_zz:  { crack: 2800, crackV: 0.9,  crackD: 0.05, boom: 400, boomV: 0.9,  boomD: 0.34, thump: [120, 42], thumpD: 0.28, thumpV: 0.7,  echo: 0.13, echoV: 0.26 },
    gun_k98: { crack: 3700, crackV: 1.0,  crackD: 0.055, boom: 360, boomV: 1.0, boomD: 0.4,  thump: [110, 34], thumpD: 0.32, thumpV: 0.85, echo: 0.12, echoV: 0.32 },
    // —— 其它步枪 ——
    gun_t44:    { crack: 3000, crackV: 0.8,  crackD: 0.045, boom: 500, boomV: 0.7, boomD: 0.28, thump: [140, 52], thumpD: 0.2,  thumpV: 0.5,  echo: 0.12, echoV: 0.2 },
    gun_smle:   { crack: 2600, crackV: 0.85, crackD: 0.05,  boom: 380, boomV: 0.85, boomD: 0.34, thump: [115, 40], thumpD: 0.28, thumpV: 0.65, echo: 0.13, echoV: 0.25 },
    gun_mosin:  { crack: 2400, crackV: 0.95, crackD: 0.055, boom: 300, boomV: 1.0, boomD: 0.4,  thump: [100, 34], thumpD: 0.32, thumpV: 0.8,  echo: 0.15, echoV: 0.3 },
    gun_spring: { crack: 3300, crackV: 0.95, crackD: 0.05,  boom: 340, boomV: 0.95, boomD: 0.38, thump: [108, 36], thumpD: 0.3,  thumpV: 0.8,  echo: 0.13, echoV: 0.3 },
    // —— 手枪：声音短促（没有长尾巴）——
    gun_nambu:  { crack: 3600, crackV: 0.7,  crackD: 0.03,  boom: 700, boomV: 0.5, boomD: 0.14, thump: [180, 80], thumpD: 0.1,  thumpV: 0.35, echo: 0.09, echoV: 0.12, lite: 1 },
    gun_webley: { crack: 2200, crackV: 0.75, crackD: 0.04,  boom: 450, boomV: 0.75, boomD: 0.2,  thump: [130, 55], thumpD: 0.16, thumpV: 0.55, echo: 0.1,  echoV: 0.16, lite: 1 },
    gun_tt33:   { crack: 4200, crackV: 0.85, crackD: 0.03,  boom: 600, boomV: 0.6, boomD: 0.16, thump: [160, 70], thumpD: 0.12, thumpV: 0.4,  echo: 0.09, echoV: 0.14, lite: 1 },
    gun_c96:    { crack: 4600, crackV: 0.95, crackD: 0.035, boom: 520, boomV: 0.7, boomD: 0.2,  thump: [150, 60], thumpD: 0.14, thumpV: 0.5,  echo: 0.1,  echoV: 0.18, lite: 1 },
    gun_1911:   { crack: 2000, crackV: 0.8,  crackD: 0.04,  boom: 360, boomV: 0.95, boomD: 0.24, thump: [110, 45], thumpD: 0.18, thumpV: 0.7,  echo: 0.1,  echoV: 0.2,  lite: 1 },
    // —— 冲锋枪：连发时每发音量较小、尾音很短（lite），避免三声叠成一团 ——
    gun_sten:   { crack: 3200, crackV: 0.7,  crackD: 0.03,  boom: 800, boomV: 0.5, boomD: 0.12, thump: [200, 90], thumpD: 0.08, thumpV: 0.25, echo: 0.08, echoV: 0.1,  lite: 1 },
    gun_mp28:   { crack: 3400, crackV: 0.75, crackD: 0.03,  boom: 700, boomV: 0.55, boomD: 0.13, thump: [190, 85], thumpD: 0.09, thumpV: 0.28, echo: 0.08, echoV: 0.1,  lite: 1 },
    gun_ppsh:   { crack: 3800, crackV: 0.8,  crackD: 0.03,  boom: 650, boomV: 0.6, boomD: 0.14, thump: [175, 75], thumpD: 0.1,  thumpV: 0.32, echo: 0.08, echoV: 0.12, lite: 1 },
    gun_tommy:  { crack: 2400, crackV: 0.8,  crackD: 0.035, boom: 450, boomV: 0.8, boomD: 0.16, thump: [130, 55], thumpD: 0.12, thumpV: 0.45, echo: 0.09, echoV: 0.14, lite: 1 },
  },
  _noiseAt(delay, dur, type, freq, q, v) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const len = Math.max(8, (ctx.sampleRate * dur) | 0);
    const b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) { const k = 1 - i / len; d[i] = (Math.random() * 2 - 1) * k * k; }
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = v;
    s.connect(f).connect(g).connect(ctx.destination); s.start(t);
  },
  _toneAt(delay, type, f0, f1, dur, v) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(25, f1), t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  gunShot(name, vol) {
    const P = this.GUN_PROFILE[name] || this.GUN_PROFILE.gun_han;
    const r = 0.94 + Math.random() * 0.12;                       // 每枪音高轻微随机
    this._noiseAt(0, P.crackD, 'highpass', P.crack * r, 0.8, P.crackV * vol);          // ① 啪
    this._noiseAt(0, P.crackD * 1.6, 'bandpass', P.crack * 0.55 * r, 1.4, P.crackV * 0.7 * vol);
    this._noiseAt(0.004, P.boomD, 'lowpass', P.boom * 2.2 * r, 0.7, P.boomV * vol);      // ② 砰
    this._toneAt(0, 'sine', P.thump[0] * r, P.thump[1], P.thumpD, P.thumpV * vol);       // ③ 闷响
    if (!P.lite) this._toneAt(0, 'triangle', 700 * r, 120, 0.09, 0.25 * vol);            // 爆燃的"嘭"（手枪/冲锋枪省略）
    this._noiseAt(P.echo, P.lite ? 0.18 : 0.34, 'lowpass', P.boom * 1.3, 0.6, P.echoV * vol);   // ④ 回声
    if (!P.lite) this._noiseAt(P.echo * 1.9, 0.4, 'lowpass', P.boom * 0.9, 0.5, P.echoV * 0.5 * vol);
  },
  /* 拉栓：开栓 = "咔—嗒"（柄抬起再后拉）；关栓 = "嗒—咔"（前推再下压锁闭） */
  boltSound(open, vol) {
    if (open) {
      this._noiseAt(0, 0.035, 'bandpass', 3800, 7, 0.45 * vol);
      this._toneAt(0, 'square', 1500, 1100, 0.03, 0.08 * vol);
      this._noiseAt(0.12, 0.06, 'bandpass', 2300, 5, 0.6 * vol);
      this._toneAt(0.12, 'triangle', 1300, 700, 0.06, 0.18 * vol);
    } else {
      this._noiseAt(0, 0.06, 'bandpass', 1900, 4, 0.55 * vol);
      this._toneAt(0, 'triangle', 420, 160, 0.07, 0.22 * vol);
      this._noiseAt(0.1, 0.035, 'bandpass', 3400, 8, 0.5 * vol);
      this._toneAt(0.1, 'square', 1700, 1250, 0.03, 0.08 * vol);
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
