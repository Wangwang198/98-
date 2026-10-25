/* ===== effects.js 粒子 / 飘字 / 金币 / 飞行道具（对象池，保证性能） ===== */
window.SD = window.SD || {};

SD.FX = {
  particles: [], texts: [], coins: [], projectiles: [], anims: [],
  MAX_P: 380,

  reset() {
    this.particles.length = 0; this.texts.length = 0;
    this.coins.length = 0; this.projectiles.length = 0; this.anims.length = 0;
  },

  /* ---------- Spine 帧动画 ---------- */
  playAnim(name, x, y, o) {
    const seq = SD.fxSeq[name];
    if (!seq || !seq.length || !seq[0]) return;
    o = o || {};
    this.anims.push({
      seq, x, y, t: 0,
      fps: o.fps || 24,
      scale: o.scale || 2.2,
      rot: o.rot || 0,
      flip: !!o.flip,
      follow: o.follow || null,      // 跟随对象（角色）
      ox: o.ox || 0, oy: o.oy || 0,  // 跟随偏移
      glow: o.glow !== false,
      alpha: o.alpha || 1,
    });
  },

  /* ---------- 粒子 ---------- */
  spawn(x, y, o) {
    if (this.particles.length >= this.MAX_P) this.particles.shift();
    this.particles.push({
      x, y,
      vx: o.vx || 0, vy: o.vy || 0,
      g: o.g != null ? o.g : 0.25,
      life: o.life || 30, t: 0,
      size: o.size || 4, shrink: o.shrink != null ? o.shrink : 0.9,
      color: o.color || '#ffd23e',
      glow: !!o.glow, shape: o.shape || 'dot', rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.3,
    });
  },

  burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 5) * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, Object.assign({}, o, {
        vx: Math.cos(a) * sp + (o.vx || 0),
        vy: Math.sin(a) * sp * (o.flat ? 0.3 : 1) + (o.vy || 0),
        size: (o.size || 4) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color,
      }));
    }
  },

  sparks(x, y, dir) {  // 命中火花
    this.burst(x, y, 14, { speed: 7, color: ['#ffd23e', '#fff6c8', '#ff9d2e'], size: 4, life: 22, glow: true, vx: dir * 3 });
  },
  dust(x, y, n) {      // 尘土
    this.burst(x, y, n || 8, { speed: 3, color: ['#8a7a5a', '#a89678', '#6b5d45'], size: 6, life: 26, g: -0.02, flat: true });
  },
  blood(x, y, dir) {   // 击飞碎屑（卡通风格用亮色代替血液）
    this.burst(x, y, 10, { speed: 6, color: ['#ff5a4e', '#ff8a7a'], size: 3.5, life: 24, vx: dir * 2 });
  },
  coinBurst(x, y, n) { // 掉金币
    for (let i = 0; i < n; i++) {
      this.coins.push({
        x, y, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 4,
        t: 0, life: 60 * 8, val: 1 + ((Math.random() * 5) | 0), landed: false,
      });
    }
  },

  /* ---------- 飘字 ---------- */
  text(x, y, str, o) {
    o = o || {};
    this.texts.push({ x, y, str, t: 0, life: o.life || 45,
      color: o.color || '#fff', size: o.size || 26, vy: o.vy || -1.6 });
  },
  damage(x, y, dmg, crit) {
    this.text(x, y - 20, '-' + dmg, {
      color: crit ? '#ffd23e' : '#ff6a5e',
      size: crit ? 40 : 28, life: crit ? 60 : 45,
    });
  },

  /* ---------- 飞行道具 ---------- */
  projectile(o) {
    this.projectiles.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, r: 14, dmg: 10, owner: null,
      type: 'wave', t: 0, life: 180, pierce: false, hitSet: null,
    }, o));
  },

  /* ---------- 更新 ---------- */
  update(game) {
    // 帧动画
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t++;
      if (a.follow) { a.x = a.follow.x + a.ox * (a.follow.facing || 1); a.y = a.follow.y - 70 + a.oy; }
      const frameDur = 60 / a.fps;
      if (a.t >= a.seq.length * frameDur) this.anims.splice(i, 1);
    }
    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t++; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.98; p.rot += p.vr;
      if (p.t >= p.life) this.particles.splice(i, 1);
    }
    // 飘字
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t++; t.y += t.vy; t.vy *= 0.96;
      if (t.t >= t.life) this.texts.splice(i, 1);
    }
    // 金币
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t++;
      if (!c.landed) {
        c.x += c.vx; c.y += c.vy; c.vy += 0.5; c.vx *= 0.98;
        if (c.y >= SD.GROUND - 8) { c.y = SD.GROUND - 8; c.vy *= -0.45; c.vx *= 0.7;
          if (Math.abs(c.vy) < 1.2) c.landed = true; }
      }
      // 磁吸拾取
      for (const pl of game.players) {
        if (!pl || pl.dead) continue;
        const dx = pl.x - c.x, dy = (pl.y - 50) - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 120 * 120) { c.x += dx * 0.12; c.y += dy * 0.12; c.landed = false; }
        if (d2 < 34 * 34) {
          SD.addCoins(c.val);
          SD.AudioMan.play('coin', { vol: 0.7 });
          this.text(c.x, c.y - 10, '+' + c.val, { color: '#ffd23e', size: 20 });
          this.burst(c.x, c.y, 6, { speed: 3, color: '#ffd23e', size: 3, life: 15, glow: true });
          this.coins.splice(i, 1);
          break;
        }
      }
      if (c.t >= c.life && this.coins[i] === c) this.coins.splice(i, 1);
    }
    // 飞行道具
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t++;
      // 子弹速度很快（>30 像素/帧），拆成小步长逐步检测，避免穿过火柴人身体（其余道具仍是 1 步）
      const steps = pr.type === 'bullet' ? Math.max(1, Math.ceil(Math.hypot(pr.vx, pr.vy) / 9)) : 1;
      let dead = pr.t >= pr.life;
      for (let st = 0; st < steps && !dead; st++) {
        pr.x += pr.vx / steps; pr.y += pr.vy / steps;
        // 命中玩家
        for (const pl of game.players) {
          if (!pl || pl.dead || pl === pr.owner) continue;
          if (pr.hitSet && pr.hitSet.has(pl)) continue;
          if (pl.bodyHit(pr.x, pr.y, pr.r)) {
            const kx = pr.knock != null ? (pr.vx >= 0 ? 1 : -1) * pr.knock : pr.vx * 0.5;
            pl.takeHit(pr.dmg, pr.owner, { kx, ky: -4, type: pr.type, sfx: pr.sfx || 'hit' });
            if (pr.type === 'bullet') {
              // 中弹反馈：火花 + 轻微顿帧/震屏
              this.burst(pr.x, pr.y, 7, { speed: 5, color: ['#fff3c4', '#ffcf60', '#ffffff'], size: 3, life: 14, glow: true });
              game.hitstop(0.04); game.shake(3.5);
            }
            if (pr.hitSet) pr.hitSet.add(pl); else dead = true;
            if (!pr.pierce) dead = true;
          }
        }
      }
      pr.vy += pr.g;
      // 拖尾
      if (pr.t % 2 === 0 && pr.type !== 'bullet') this.spawn(pr.x, pr.y, {
        vx: -pr.vx * 0.1, vy: -pr.vy * 0.1, g: 0, life: 14,
        size: pr.r * 0.5, color: pr.color || '#7ad9ff', glow: true,
      });
      if (pr.x < -60 || pr.x > SD.W + 60) dead = true;
      if (pr.y > SD.GROUND + 20) {
        if (pr.type === 'arrow' || pr.type === 'fire') {
          this.burst(pr.x, SD.GROUND, 8, { speed: 4, color: pr.color || '#ff9d2e', size: 4, life: 18 });
          if (pr.type === 'fire') this.playAnim('fire', pr.x, SD.GROUND - 40, { scale: 2.2, fps: 24 });
          dead = true;
        } else if (pr.type === 'bullet') {
          this.dust(pr.x, SD.GROUND, 6);                       // 子弹打在地上溅起尘土
          this.burst(pr.x, SD.GROUND - 4, 5, { speed: 4, color: ['#fff3c4', '#ffcf60'], size: 2.5, life: 12, glow: true });
          dead = true;
        }
      }
      if (dead) this.projectiles.splice(i, 1);
    }
  },

  /* ---------- 绘制 ---------- */
  draw(ctx) {
    // 帧动画（刀光/火焰/雷电）
    for (const a of this.anims) {
      const fi = Math.min(a.seq.length - 1, (a.t / (60 / a.fps)) | 0);
      const img = a.seq[fi];
      if (!img) continue;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);
      if (a.flip) ctx.scale(-1, 1);
      ctx.globalAlpha = a.alpha;
      if (a.glow) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 12; }
      const w = img.width * a.scale, h = img.height * a.scale;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    // 金币
    for (const c of this.coins) {
      const blink = c.life - c.t < 90 && (c.t % 10 < 5);
      if (blink) continue;
      ctx.save(); ctx.translate(c.x, c.y);
      const sq = Math.abs(Math.sin(c.t * 0.12));
      ctx.scale(0.4 + 0.6 * sq, 1);
      ctx.fillStyle = '#ffd23e'; ctx.strokeStyle = '#a86e00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.29); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a86e00'; ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('¥', 0, 1);
      ctx.restore();
    }
    // 飞行道具
    for (const pr of this.projectiles) {
      ctx.save(); ctx.translate(pr.x, pr.y);
      if (pr.type === 'wave' || pr.type === 'dragon') {
        ctx.rotate(Math.atan2(pr.vy, pr.vx));
        ctx.shadowColor = pr.color || '#7ad9ff'; ctx.shadowBlur = 18;
        ctx.fillStyle = pr.color || '#7ad9ff';
        ctx.beginPath(); ctx.ellipse(0, 0, pr.r * 1.6, pr.r * 0.7, 0, 0, 6.29); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.ellipse(pr.r * 0.4, 0, pr.r * 0.8, pr.r * 0.35, 0, 0, 6.29); ctx.fill();
      } else if (pr.type === 'arrow') {
        ctx.rotate(Math.atan2(pr.vy, pr.vx));
        ctx.strokeStyle = '#c8a06a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.fillStyle = pr.color || '#dfe8ff';
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(6, -5); ctx.lineTo(6, 5); ctx.fill();
      } else if (pr.type === 'thrown') {
        ctx.rotate(Math.atan2(pr.vy, pr.vx) + Math.PI / 4);
        ctx.strokeStyle = '#3a3f52'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(12, 0); ctx.stroke();
        ctx.fillStyle = pr.color || '#cfe0ff';
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(8, -6); ctx.lineTo(8, 6); ctx.fill();
        ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(-8, 0, 3, 0, 6.29); ctx.fill();
      } else if (pr.type === 'bullet') {
        // 步枪/手枪/冲锋枪子弹：带拖光的曳光弹（不用 shadowBlur，用两层描边模拟发光，手机上更省）
        ctx.rotate(Math.atan2(pr.vy, pr.vx));
        const tl = pr.tl || 34;
        const tg = ctx.createLinearGradient(-tl, 0, 0, 0);
        tg.addColorStop(0, 'rgba(255,200,90,0)'); tg.addColorStop(1, 'rgba(255,244,200,.95)');
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,170,60,.28)'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(-tl * 0.7, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.strokeStyle = tg; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-tl, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath(); ctx.ellipse(2, 0, 6.5, 3, 0, 0, 6.29); ctx.fill();
      } else if (pr.type === 'fire') {
        ctx.shadowColor = '#ff7a2e'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#ff9d2e';
        ctx.beginPath(); ctx.arc(0, 0, pr.r, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#ffe28a';
        ctx.beginPath(); ctx.arc(0, 0, pr.r * 0.5, 0, 6.29); ctx.fill();
      }
      ctx.restore();
    }
    // 粒子
    for (const p of this.particles) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 10; } else ctx.shadowBlur = 0;
      ctx.fillStyle = p.color;
      const s = p.size * (p.shrink ? k : 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, s), 0, 6.29); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    // 飘字
    for (const t of this.texts) {
      const k = 1 - t.t / t.life;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = '900 ' + t.size + 'px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
};
