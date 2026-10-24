/* ===== game.js 战斗场景：主循环 / 物理调度 / 相机 / HUD / 关卡机关 ===== */
window.SD = window.SD || {};

SD.Game = class {
  /**
   * cfg: { mode:'single'|'double', level:LevelObj, diff:0|1|2,
   *        p1:{color,weapon,helmet}, p2:{color,weapon,helmet} }
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.mode = cfg.mode;
    this.level = cfg.level;
    this.players = [
      new SD.Player({ side: 1, x: 340, name: '玩家 1', ...cfg.p1 }),
      new SD.Player({ side: 2, x: SD.W - 340, name: cfg.mode === 'single' ? 'AI 名将' : '玩家 2',
                      isAI: cfg.mode === 'single', ...cfg.p2 }),
    ];
    this.ai = cfg.mode === 'single' ? new SD.AI(this.players[1], cfg.diff) : null;

    this.t = 0;
    this.phase = 'count';          // count | fight | over
    this.countT = 3.4;
    this.overT = 0; this.winner = null;
    this.freezeT = 0;              // hit-stop
    this.shakeT = 0; this.shakeMag = 0;
    this.flashT = 0; this.flashColor = '#fff';
    this.slowmo = 1; this.slowmoT = 0;
    this.clouds = []; for (let i = 0; i < 5; i++) this.clouds.push({ x: Math.random() * SD.W, y: 40 + Math.random() * 130, s: 0.5 + Math.random(), v: 4 + Math.random() * 8 });
    this.hazardT = 6;
    this.bomb = cfg.level.hazard === 'bomb' ? { x: SD.W / 2, y: SD.GROUND, t: 25, respawn: 0 } : null;
    this.hintT = 6;
    this.drops = [];             // 武器掉落气泡
    this.dropT = 7;
    SD.FX.reset();
  }

  foeOf(p) { return p === this.players[0] ? this.players[1] : this.players[0]; }

  shake(m) { this.shakeMag = Math.max(this.shakeMag, m); this.shakeT = 0.35; }
  hitstop(t) { this.freezeT = Math.max(this.freezeT, t); }
  flashSuper(p) {
    this.flashT = 0.35; this.flashColor = '#fff';
    this.slowmo = 0.35; this.slowmoT = 0.5;
    this.shake(6);
  }

  onHitFeel(x, y, dir, crit) {
    this.hitstop(crit ? 0.09 : 0.055);
    this.shake(crit ? 9 : 4.5);
    SD.FX.sparks(x, y, dir);
    if (Math.random() < 0.25) SD.AudioMan.play('clash', { vol: 0.4 });
  }

  aoeHit(attacker, x, y, r, dmg, opt) {
    for (const pl of this.players) {
      if (!pl || pl.dead || pl === attacker) continue;
      const dx = pl.x - x, dy = (pl.y - 60) - y;
      if (dx * dx + dy * dy < r * r) {
        pl.takeHit(dmg, attacker, { kx: (dx >= 0 ? 1 : -1) * (Math.abs(opt.kx) || 8), ky: opt.ky, stun: opt.stun });
        this.onHitFeel(pl.x, pl.y - 70, Math.sign(dx) || 1, false);
      }
    }
  }

  /* ---------------- 更新 ---------------- */
  update(rdt) {
    // 暂停
    if (SD.input._pausePressed) {
      SD.input._pausePressed = false;
      if (this.phase === 'fight' || this.phase === 'count') this.paused = !this.paused;
    }
    if (this.paused) {
      // 暂停时只画一帧静态 + 提示
      return;
    }
    if (this.slowmoT > 0) { this.slowmoT -= rdt; if (this.slowmoT <= 0) this.slowmo = 1; }
    const dt = Math.min(rdt, 0.05) * this.slowmo;
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - rdt);
    if (this.shakeT > 0) { this.shakeT -= rdt; if (this.shakeT <= 0) this.shakeMag = 0; }

    // hit-stop 冻结
    if (this.freezeT > 0) { this.freezeT -= rdt; return; }

    // 云朵
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > SD.W + 120) c.x = -120; }

    if (this.phase === 'count') {
      this.countT -= rdt;
      if (this.countT <= 0) { this.phase = 'fight'; SD.FX.text(SD.W / 2, 260, '开战!', { color: '#ffd23e', size: 64, life: 50 }); SD.AudioMan.play('super', { vol: 0.5 }); }
      return;
    }

    if (this.hintT > 0) this.hintT -= rdt;

    // ---- 玩家输入 ----
    const in1 = SD.input.p1, in2raw = SD.input.p2;
    let in2 = in2raw;
    if (this.ai) in2 = this.ai.input(dt, this);

    if (this.phase === 'fight') {
      this.players[0].update(dt, in1, this);
      this.players[1].update(dt, in2, this);
      in1._upHeld = in1.up; in2raw._upHeld = in2raw.up;

      // 身体推挤（按武器长度保持间距，不会贴身）
      const [a, b] = this.players;
      if (!a.dead && !b.dead && !a.ragdoll && !b.ragdoll) {
        const dx = b.x - a.x;
        const minD = Math.min(96, (a.weapon.range + b.weapon.range) * 0.5 + 22);
        if (Math.abs(dx) < minD && Math.abs(a.y - b.y) < 80) {
          const push = (minD - Math.abs(dx)) / 2 * Math.sign(dx || 1);
          a.x -= push * 0.75; b.x += push * 0.75;
          a.vx -= push * 0.14; b.vx += push * 0.14;
        }
        // 拼刀：双方同时挥击且武器相交 → 弹刀火花 + 双双退开
        this.parryT = Math.max(0, (this.parryT || 0) - dt);
        const inSwing = p => p.attackT >= 0 && !p.hitFlag && (p.attackT / p.attackDur) > 0.3 && (p.attackT / p.attackDur) < 0.72;
        if (this.parryT <= 0 && inSwing(a) && inSwing(b) && !a.weapon.ranged && !b.weapon.ranged) {
          const ta = a.weaponTip(), tb = b.weaponTip();
          const ddx = ta.x - tb.x, ddy = ta.y - tb.y;
          if (ddx * ddx + ddy * ddy < 60 * 60) {
            a.hitFlag = b.hitFlag = true;          // 双方这刀都不算命中
            a.vx = -a.facing * 7; b.vx = -b.facing * 7;
            a.vy = Math.min(a.vy, -3); b.vy = Math.min(b.vy, -3);
            a.onGround = b.onGround = false;
            const mx = (ta.x + tb.x) / 2, my = (ta.y + tb.y) / 2;
            SD.FX.burst(mx, my, 20, { speed: 8, color: ['#ffffff', '#ffd23e', '#7ad9ff'], size: 4, life: 22, glow: true });
            SD.FX.text(mx, my - 30, '弹刀!', { color: '#fff', size: 24, life: 30 });
            SD.AudioMan.play('clash', { vol: 0.9 });
            this.hitstop(0.06); this.shake(5);
            this.parryT = 0.4;
          }
        }
      }

      // ---- 关卡机关 ----
      this.updateHazard(dt);

      // ---- 武器掉落气泡 ----
      this.dropT -= dt;
      if (this.dropT <= 0) {
        this.dropT = 16 + Math.random() * 10;
        const ids = Object.keys(SD.WEAPONS);
        this.drops.push({ x: 220 + Math.random() * (SD.W - 440), y: 110 + Math.random() * 150,
          wid: ids[(Math.random() * ids.length) | 0], t: 0, life: 720 });
      }
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i]; d.t++;
        const dy = d.y + Math.sin(d.t * 0.05) * 10;
        for (const pl of this.players) {
          if (pl.dead) continue;
          if (Math.abs(pl.x - d.x) < 44 && Math.abs((pl.y - 80) - dy) < 80) {
            const oldMax = pl.maxHp;
            pl.setWeapon(d.wid);
            pl.maxHp = 100 + (pl.weapon.hp || 0);
            const hpGain = Math.max(0, pl.maxHp - oldMax);
            pl.hp = Math.min(pl.maxHp, pl.hp + hpGain);
            pl.hpGhost = Math.min(pl.maxHp, pl.hpGhost + hpGain);
            SD.FX.text(pl.x, pl.y - 165, '获得 ' + SD.WEAPONS[d.wid].name + '!', { color: '#7ad9ff', size: 26 });
            SD.FX.burst(d.x, dy, 16, { speed: 5, color: '#7ad9ff', size: 4, life: 22, glow: true });
            SD.AudioMan.play('chest', { vol: 0.6 });
            this.drops.splice(i, 1); break;
          }
        }
        if (this.drops[i] === d && d.t > d.life) this.drops.splice(i, 1);
      }

      // ---- 胜负 ----
      for (const p of this.players) {
        if (p.dead && !this.winner) {
          this.winner = this.foeOf(p);
          this.phase = 'over'; this.overT = 0;
          this.slowmo = 0.25; this.slowmoT = 0.9;
          this.shake(10);
          // 胜者彩带
          for (let i = 0; i < 40; i++) {
            SD.FX.spawn(this.winner.x + (Math.random() - 0.5) * 200, this.winner.y - 150 - Math.random() * 100, {
              vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 5, g: 0.2,
              life: 70 + Math.random() * 40, size: 4 + Math.random() * 4,
              color: ['#ffd23e', '#ff5a8a', '#5ad9ff', '#7dff9a', '#c88aff'][(Math.random() * 5) | 0],
            });
          }
        }
      }
    } else if (this.phase === 'over') {
      // 尸体缓慢更新
      for (const p of this.players) p.update(dt, { left: 0, right: 0, up: 0, down: 0 }, this);
      this.overT += rdt;
      if (this.overT > 1.8 && !this._ended) {
        this._ended = true;
        SD.endBattle(this.winner);
      }
    }

    SD.FX.update(this);
  }

  updateHazard(dt) {
    const hz = this.level.hazard;
    if (hz === 'firerain') {
      this.hazardT -= dt;
      if (this.hazardT <= 0) {
        this.hazardT = 7;
        SD.FX.text(SD.W / 2, 180, '🔥 火雨来袭!', { color: '#ff9d2e', size: 34, life: 60 });
        SD.AudioMan.play('skill', { vol: 0.6 });
        for (let i = 0; i < 6; i++) {
          SD.FX.projectile({
            x: 120 + Math.random() * (SD.W - 240), y: -30 - Math.random() * 200 - i * 60,
            vx: (Math.random() - 0.5) * 2, vy: 4 + Math.random() * 2, g: 0.18,
            dmg: 8, owner: null, type: 'fire', r: 13, life: 300, color: '#ff9d2e',
          });
        }
      }
    } else if (hz === 'coinrain') {
      this.hazardT -= dt;
      if (this.hazardT <= 0) {
        this.hazardT = 6;
        SD.FX.text(SD.W / 2, 180, '💰 金币雨!', { color: '#ffd23e', size: 34, life: 60 });
        for (let i = 0; i < 6; i++)
          SD.FX.coinBurst(150 + Math.random() * (SD.W - 300), 80 + Math.random() * 200, 1);
        SD.AudioMan.play('coin', { vol: 0.6 });
      }
    } else if (hz === 'petal') {
      // 飘落樱花（纯氛围）
      if ((this.t * 60 | 0) % 8 === 0) {
        SD.FX.spawn(Math.random() * SD.W, -10, {
          vx: -1 - Math.random() * 1.5, vy: 1 + Math.random(), g: 0.01,
          life: 240, size: 4 + Math.random() * 3, color: ['#f0a8c0', '#f8d0e0', '#e890b0'],
        });
      }
    } else if (hz === 'bomb' && this.bomb) {
      const b = this.bomb;
      if (b.respawn > 0) { b.respawn -= dt; if (b.respawn <= 0) { b.t = 25; b.x = 300 + Math.random() * (SD.W - 600); } return; }
      b.t -= dt;
      if (b.t <= 0) {
        // 大爆炸
        SD.FX.burst(b.x, b.y - 30, 50, { speed: 12, color: ['#ff9d2e', '#ffd23e', '#ff5a2e', '#fff'], size: 7, life: 40, glow: true });
        SD.FX.dust(b.x, SD.GROUND, 30);
        this.aoeHit(null, b.x, b.y - 40, 210, 30, { kx: 14, ky: -11 });
        // 波及双方（aoeHit 跳过 attacker=null 不跳过任何人）
        this.shake(18); this.hitstop(0.08);
        SD.AudioMan.play('explode', { vol: 1 });
        b.respawn = 9;
      } else if (b.t < 5 && (b.t * 2 | 0) % 2 === 0) {
        SD.FX.spawn(b.x, b.y - 46, { vx: 0, vy: -2, g: -0.05, life: 15, size: 4, color: '#ff5a2e', glow: true });
      }
    }
  }

  /* ---------------- 绘制 ---------------- */
  draw(ctx) {
    ctx.save();
    // 震屏
    if (this.shakeMag > 0) {
      const m = this.shakeMag * (this.shakeT / 0.35);
      ctx.translate((Math.random() - 0.5) * m * 2, (Math.random() - 0.5) * m * 2);
    }

    this.drawBackground(ctx);

    // 浮空平台（参考游戏风格：深色台体 + 亮色台面）
    if (this.level.plat) {
      for (const p of this.level.plat) {
        ctx.fillStyle = 'rgba(20,16,38,.92)';
        this.rr(ctx, p.x, p.y, p.w, 26, 8); ctx.fill();
        ctx.fillStyle = '#c96a3a';
        this.rr(ctx, p.x, p.y, p.w, 9, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,120,.5)';
        ctx.fillRect(p.x + 6, p.y + 2, p.w - 12, 3);
      }
    }

    // 武器掉落气泡
    for (const d of this.drops) {
      const dy = d.y + Math.sin(d.t * 0.05) * 10;
      const blink = d.life - d.t < 120 && (d.t % 12 < 6);
      if (blink) continue;
      ctx.save(); ctx.translate(d.x, dy);
      ctx.globalAlpha = 0.9;
      const bg = ctx.createRadialGradient(-8, -8, 4, 0, 0, 34);
      bg.addColorStop(0, 'rgba(255,255,255,.85)');
      bg.addColorStop(0.6, 'rgba(140,200,255,.35)');
      bg.addColorStop(1, 'rgba(80,140,255,.15)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, 32, 0, 6.29); ctx.fill();
      ctx.strokeStyle = 'rgba(200,230,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      SD.Gear.drawWeaponIcon(ctx, SD.WEAPONS[d.wid], 0, 2, 30);
      ctx.restore();
    }

    // 炸弹机关
    if (this.bomb && this.bomb.respawn <= 0) this.drawBomb(ctx);

    // 角色
    for (const p of this.players) p.draw(ctx, this.t);

    // 头顶血条（参考游戏样式：绿底 + 白色残影 + 红损）
    for (const p of this.players) {
      if (p.dead) continue;
      const bw = 64, bh = 8, bx = p.x - bw / 2, by = p.y - 146;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      this.rr(ctx, bx - 2, by - 2, bw + 4, bh + 4, 4); ctx.fill();
      ctx.fillStyle = '#e0392a';
      this.rr(ctx, bx, by, bw, bh, 3); ctx.fill();
      const gk = Math.max(0, p.hpGhost / p.maxHp);
      ctx.fillStyle = '#ffffff';                      // 白色残影（刚受到的伤害）
      if (gk > 0) { this.rr(ctx, bx, by, bw * gk, bh, 3); ctx.fill(); }
      const k = Math.max(0, p.hp / p.maxHp);
      ctx.fillStyle = '#46e05a';
      if (k > 0) { this.rr(ctx, bx, by, bw * k, bh, 3); ctx.fill(); }
      // 枪械：拉栓进度条（拉栓完才能开火）
      if (p.weapon.gun && p.boltT > 0) {
        const bp = 1 - p.boltT / (p.weapon.bolt || 2.5);
        ctx.fillStyle = 'rgba(0,0,0,.45)'; this.rr(ctx, bx - 2, by + 12, bw + 4, 8, 3); ctx.fill();
        ctx.fillStyle = '#ffcf5a'; this.rr(ctx, bx, by + 14, bw * bp, 4, 2); ctx.fill();
      }
    }

    SD.FX.draw(ctx);

    this.drawHUD(ctx);

    // 白闪（大招）
    if (this.flashT > 0) {
      ctx.globalAlpha = this.flashT / 0.35 * 0.5;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-20, -20, SD.W + 40, SD.H + 40);
      ctx.globalAlpha = 1;
    }

    // 倒计时
    if (this.phase === 'count') {
      const n = Math.ceil(this.countT - 0.4);
      ctx.textAlign = 'center';
      ctx.font = '900 120px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      const str = n > 0 ? String(n) : '开战!';
      ctx.strokeText(str, SD.W / 2, SD.H / 2);
      ctx.fillStyle = n > 0 ? '#fff' : '#ffd23e';
      ctx.fillText(str, SD.W / 2, SD.H / 2);
    }

    // KO 字样
    if (this.phase === 'over') {
      ctx.textAlign = 'center';
      ctx.font = '900 96px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,.65)';
      ctx.strokeText('K.O.', SD.W / 2, 300);
      ctx.fillStyle = '#ff5a3a'; ctx.fillText('K.O.', SD.W / 2, 300);
    }

    // 暂停遮罩
    if (this.paused) {
      ctx.fillStyle = 'rgba(5,8,20,.6)';
      ctx.fillRect(-20, -20, SD.W + 40, SD.H + 40);
      ctx.textAlign = 'center';
      ctx.font = '900 64px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.strokeText('已暂停', SD.W / 2, SD.H / 2 - 10);
      ctx.fillStyle = '#fff'; ctx.fillText('已暂停', SD.W / 2, SD.H / 2 - 10);
      ctx.font = '700 22px "Microsoft YaHei",sans-serif';
      ctx.strokeText('按 P / Esc 继续', SD.W / 2, SD.H / 2 + 40);
      ctx.fillStyle = '#9fb4e8'; ctx.fillText('按 P / Esc 继续', SD.W / 2, SD.H / 2 + 40);
    }

    // 大招就绪提示（每人一次）
    for (const p of this.players) {
      if (!p.dead && p.energy >= 100 && !p._superHinted && this.phase === 'fight') {
        p._superHinted = true;
        SD.FX.text(p.x, p.y - 180, (p.side === 1 ? '按 R 放' : '按 Enter 放') + '大招!', { color: '#ffd23e', size: 26, life: 80 });
      }
      if (p.energy < 100) p._superHinted = false;
    }

    // 已移除竞技场外圈边框，让战斗背景与可视区域更完整。
    ctx.restore();
  }

  drawBackground(ctx) {
    const lv = this.level;
    const img = SD.images[lv.bg];
    if (!img && SD.loadBg) SD.loadBg(lv.bg);
    if (img) {
      // 三张新增历史地图也采用 cover 缩放：放大并居中裁去少量上下边缘，
      // 让背景铺满整个战斗区域，不再在左右留下黑边。
      if (lv.preserveOriginal) {
        const fit = Math.max(SD.W / img.width, SD.H / img.height) * 1.04;
        const drawW = img.width * fit;
        const drawH = img.height * fit;
        ctx.drawImage(img, (SD.W - drawW) / 2, (SD.H - drawH) / 2, drawW, drawH);
        return;
      }
      // cover 绘制 + 轻微视差呼吸（保留既有地图的原效果）
      const s = Math.max(SD.W / img.width, SD.H / img.height) * 1.04;
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (SD.W - w) / 2 + Math.sin(this.t * 0.2) * 6, (SD.H - h) / 2, w, h);
      // 地面衔接：半透明压暗，保留 AI 图的地面质感
      const gg = ctx.createLinearGradient(0, SD.GROUND, 0, SD.H);
      gg.addColorStop(0, 'rgba(10,8,20,.15)');
      gg.addColorStop(1, 'rgba(10,8,20,.55)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, SD.GROUND, SD.W, SD.H - SD.GROUND);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(0, SD.GROUND, SD.W, 3);
      return;
    }
    // ---- 程序化回退背景 ----
    const g = ctx.createLinearGradient(0, 0, 0, SD.H);
    g.addColorStop(0, lv.sky[0]); g.addColorStop(0.6, lv.sky[1]); g.addColorStop(1, lv.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, SD.W, SD.H);
    // 云
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (const c of this.clouds) {
      ctx.beginPath(); ctx.ellipse(c.x, c.y, 70 * c.s, 22 * c.s, 0, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x + 40 * c.s, c.y + 8, 50 * c.s, 16 * c.s, 0, 0, 6.29); ctx.fill();
    }
    // 远山
    ctx.fillStyle = lv.far;
    ctx.beginPath(); ctx.moveTo(0, SD.GROUND);
    for (let x = 0; x <= SD.W; x += 80) ctx.lineTo(x, SD.GROUND - 150 - Math.sin(x * 0.011 + 2) * 70);
    ctx.lineTo(SD.W, SD.GROUND); ctx.fill();
    // 近山
    ctx.fillStyle = lv.near;
    ctx.beginPath(); ctx.moveTo(0, SD.GROUND);
    for (let x = 0; x <= SD.W; x += 60) ctx.lineTo(x, SD.GROUND - 60 - Math.abs(Math.sin(x * 0.02)) * 60);
    ctx.lineTo(SD.W, SD.GROUND); ctx.fill();
    // 地面
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, SD.GROUND, SD.W, SD.H - SD.GROUND);
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fillRect(0, SD.GROUND, SD.W, 4);
  }

  drawBomb(ctx) {
    const b = this.bomb;
    ctx.save(); ctx.translate(b.x, b.y);
    // 底座
    ctx.fillStyle = '#7a2c3a';
    ctx.beginPath(); ctx.ellipse(0, 0, 52, 14, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(-52, -8, 104, 8);
    // 弹体
    const urgent = b.t < 5;
    ctx.fillStyle = urgent && (this.t * 6 | 0) % 2 ? '#5a1a2a' : '#2a2438';
    ctx.beginPath(); ctx.arc(0, -44, 34, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#3a3450'; ctx.beginPath(); ctx.arc(-8, -52, 12, 0, 6.29); ctx.fill();
    // 引信火花
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -78); ctx.quadraticCurveTo(10, -92, 20, -88); ctx.stroke();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.arc(20, -88, 4 + Math.random() * 3, 0, 6.29); ctx.fill();
    // 倒计时
    ctx.textAlign = 'center';
    ctx.font = '900 30px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    const s = Math.ceil(b.t);
    ctx.strokeText(s, 0, -32);
    ctx.fillStyle = urgent ? '#ff5a3a' : '#fff';
    ctx.fillText(s, 0, -32);
    ctx.restore();
  }

  drawHUD(ctx) {
    const [p1, p2] = this.players;
    this.drawPlate(ctx, p1, 30, false);
    this.drawPlate(ctx, p2, SD.W - 30 - 380, true);
    this.drawCircleHUD(ctx, p1, false);
    this.drawCircleHUD(ctx, p2, true);

    // 中央金币
    ctx.textAlign = 'center';
    ctx.font = '800 22px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText('💰 ' + SD.coins, SD.W / 2, 40);
    ctx.fillStyle = '#ffd23e'; ctx.fillText('💰 ' + SD.coins, SD.W / 2, 40);

    // 开局操作提示
    if (this.hintT > 0 && this.phase === 'fight') {
      ctx.globalAlpha = Math.min(1, this.hintT / 1.5) * 0.9;
      ctx.font = '700 20px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      const l1 = 'P1：A/D移动 · 按住W大跳 · E小招 · R大招';
      const l2 = this.mode === 'single' ? '击败 AI 名将，赢取 50 金币！'
        : 'P2：←/→移动 · 按住↑大跳 · 右Shift小招 · Enter大招';
      ctx.strokeText(l1, SD.W / 2, SD.H - 60); ctx.fillStyle = '#cfe0ff'; ctx.fillText(l1, SD.W / 2, SD.H - 60);
      ctx.strokeText(l2, SD.W / 2, SD.H - 32); ctx.fillStyle = '#9fe8b8'; ctx.fillText(l2, SD.W / 2, SD.H - 32);
      ctx.globalAlpha = 1;
    }
  }

  drawPlate(ctx, p, x, right) {
    const y = 18, w = 380, h = 26;
    // 名字
    ctx.textAlign = right ? 'right' : 'left';
    ctx.font = '800 20px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    const label = p.name + ' · ' + p.weapon.name;
    ctx.strokeText(label, right ? x + w : x, y - 2);
    ctx.fillStyle = '#fff'; ctx.fillText(label, right ? x + w : x, y - 2);
    // 血条底
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    this.rr(ctx, x - 3, y + 6, w + 6, h + 6, 8); ctx.fill();
    // 血条
    const hpK = Math.max(0, p.hp / p.maxHp);
    const hg = ctx.createLinearGradient(x, 0, x + w, 0);
    hg.addColorStop(0, hpK > 0.3 ? '#4ee66a' : '#ff5a3a');
    hg.addColorStop(1, hpK > 0.3 ? '#9aff7a' : '#ff9a5a');
    ctx.fillStyle = hg;
    if (hpK > 0) { this.rr(ctx, right ? x + w * (1 - hpK) : x, y + 9, w * hpK, h, 6); ctx.fill(); }
    // 能量条（枪械没有大招，不显示）
    const ey = y + h + 16;
    const gunUser = !!p.weapon.gun;
    if (!gunUser) {
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    this.rr(ctx, x - 3, ey, w * 0.7 + 6, 16, 6); ctx.fill();
    const eK = p.energy / 100;
    const eg = ctx.createLinearGradient(x, 0, x + w * 0.7, 0);
    eg.addColorStop(0, '#3a9fe0'); eg.addColorStop(1, eK >= 1 ? '#ffd23e' : '#7ad9ff');
    ctx.fillStyle = eg;
    if (eK > 0) { this.rr(ctx, right ? x + w * 0.7 * (1 - eK) + 3 : x, ey + 3, w * 0.7 * eK, 10, 4); ctx.fill(); }
    if (eK >= 1) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 8);
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2;
      this.rr(ctx, x - 3, ey, w * 0.7 + 6, 16, 6); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    }
    // 技能冷却指示
    const sy = gunUser ? ey - 8 : ey + 24;
    ctx.font = '700 15px "Microsoft YaHei",sans-serif';
    ctx.textAlign = right ? 'right' : 'left';
    let cdTxt = p.skillCd > 0 ? p.weapon.skill.name + ' ' + p.skillCd.toFixed(1) + 's' : p.weapon.skill.name + ' ✓';
    if (gunUser) cdTxt = p.boltT > 0 ? '拉栓中 ' + p.boltT.toFixed(1) + 's' : '已上膛 ✓';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(cdTxt, right ? x + w : x, sy + 8);
    ctx.fillStyle = p.skillCd > 0 ? '#8fa3d8' : '#7ad9ff';
    ctx.fillText(cdTxt, right ? x + w : x, sy + 8);
  }

  /* 圆形技能/大招按钮（参考游戏 HUD 风格） */
  drawCircleHUD(ctx, p, right) {
    const sx = right ? SD.W - 96 : 96;      // 小招圆心
    const ux = right ? SD.W - 70 : 70;      // 大招圆心
    const keySkill = p.side === 1 ? 'E' : 'Shift';
    const keySuper = p.side === 1 ? 'R' : 'Enter';

    const gun = !!p.weapon.gun;     // 枪械：没有大招/小招，小圆改为"拉栓进度"
    // ---- 大招（小圆，能量环）----
    ctx.save();
    ctx.globalAlpha = 0.92;
    if (!gun) {
    ctx.fillStyle = 'rgba(15,20,45,.75)';
    ctx.beginPath(); ctx.arc(ux, 420, 34, 0, 6.29); ctx.fill();
    // 能量弧
    const ek = p.energy / 100;
    ctx.strokeStyle = ek >= 1 ? '#ffd23e' : '#3a9fe0';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(ux, 420, 30, -Math.PI / 2, -Math.PI / 2 + ek * 6.283); ctx.stroke();
    if (ek >= 1) {
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.t * 8);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ux, 420, 34, 0, 6.29); ctx.stroke();
      ctx.globalAlpha = 0.92;
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '20px sans-serif';
    ctx.fillText('💫', ux, 416);
    ctx.font = '700 12px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#cfe0ff'; ctx.fillText('大招', ux, 440);
    // 键位标签
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    this.rr(ctx, ux + 20, 388, keySuper.length * 9 + 12, 20, 5); ctx.fill();
    ctx.fillStyle = '#222'; ctx.font = '800 12px sans-serif';
    ctx.fillText(keySuper, ux + 20 + (keySuper.length * 9 + 12) / 2, 399);
    }

    // ---- 小招（大圆，冷却扫过）----
    const maxCd = p.weapon.skill.cd * (1 - (p.hmod.cdr || 0));
    const ck = gun ? (p.boltT > 0 ? 1 - p.boltT / (p.weapon.bolt || 2.5) : 1)
      : (p.skillCd > 0 ? 1 - p.skillCd / maxCd : 1);
    ctx.fillStyle = 'rgba(15,20,45,.75)';
    ctx.beginPath(); ctx.arc(sx, 560, 46, 0, 6.29); ctx.fill();
    // 就绪部分
    ctx.fillStyle = ck >= 1 ? 'rgba(122,217,255,.35)' : 'rgba(122,217,255,.18)';
    ctx.beginPath(); ctx.moveTo(sx, 560);
    ctx.arc(sx, 560, 44, -Math.PI / 2, -Math.PI / 2 + ck * 6.283); ctx.fill();
    ctx.strokeStyle = ck >= 1 ? '#ffd23e' : 'rgba(122,217,255,.4)';   // 就绪=金环（参考游戏样式）
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(sx, 560, 46, 0, 6.29); ctx.stroke();
    if (ck >= 1) {
      ctx.shadowColor = '#ffd23e'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(sx, 560, 46, 0, 6.29); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (gun) SD.Gear.drawWeaponIcon(ctx, p.weapon, sx, 550, 38);
    else { ctx.font = '26px sans-serif'; ctx.fillText(p.weapon.icon, sx, 552); }
    ctx.font = '700 13px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#fff';
    if (gun) ctx.fillText(ck >= 1 ? '已上膛' : '拉栓 ' + p.boltT.toFixed(1), sx, 580);
    else ctx.fillText(ck >= 1 ? p.weapon.skill.name : p.skillCd.toFixed(1), sx, 580);
    if (!gun) {
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    this.rr(ctx, sx + 30, 516, keySkill.length * 9 + 12, 20, 5); ctx.fill();
    ctx.fillStyle = '#222'; ctx.font = '800 12px sans-serif';
    ctx.fillText(keySkill, sx + 30 + (keySkill.length * 9 + 12) / 2, 527);
    }
    ctx.restore();
  }

  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
};
