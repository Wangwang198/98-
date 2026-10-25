/* ===== player.js 火柴人角色：物理 / 程序化骨骼动画 / 攻击 / 技能 ===== */
window.SD = window.SD || {};

SD.Player = class {
  constructor(cfg) {
    this.side = cfg.side;                 // 1 | 2
    this.name = cfg.name || ('玩家' + cfg.side);
    this.isAI = !!cfg.isAI;
    this.x = cfg.x; this.y = SD.GROUND;
    this.vx = 0; this.vy = 0;
    this.facing = cfg.side === 1 ? 1 : -1;
    this.onGround = true;
    this.maxHp = 100; this.hp = 100;
    this.energy = 0;                      // 大招能量 0~100（15秒自动充满）
    this.invulnT = 0;                     // 受击无敌帧（防止贴脸连打）
    this.hitChainN = 0; this.hitChainT = 0; // 连击数（击退递增）
    this.hpGhost = 100;                   // 血条白色残影
    this.dead = false; this.deadT = 0;

    // 枪械状态：拉栓倒计时 / 后坐力 / 枪口火光 / 瞄准角
    this.boltT = 0; this.recoilT = 0; this.muzzleT = 0; this.aim = -0.12; this._bo = false; this._bc = false;
    this.burstLeft = 0; this.burstT = 0; this.burstIdx = 0;                            // 冲锋枪三连发
    this.windT = -1; this.aimWarn = false; this.aimRemain = 99; this._lockAim = null;   // AI 开火前的瞄准预警 / 锁定

    this.setColor(cfg.color || 'cyan');
    this.setWeapon(cfg.weapon || 'sword');
    this.setHelmet(cfg.helmet || 'none');
    this.maxHp = 100 + (this.weapon.hp || 0);
    this.hp = this.maxHp;
    this.hpGhost = this.maxHp;

    // 动画/战斗状态
    this.walkPhase = 0;
    this.attackT = -1; this.attackDur = 0.3; this.hitFlag = false; this.comboN = 0;
    this.attackCd = 0; this.hitstun = 0; this.stun = 0; this.armorT = 0;
    this.skillCd = 0; this.jumpHold = 0; this.coyote = 0;
    this.flurryN = 0; this.flurryT = 0; this.slamPending = 0; this.dashT = 0;
    this.musouN = 0; this.lifeSteal = 0; this.blinkGhost = 0; this.buffT = 0;
    // 布娃娃翻滚状态
    this.rot = 0; this.rotV = 0; this.ragdoll = false;
    this.hurtFlash = 0; this.landSquash = 0; this.swingSfxT = 0;
    this.dropThrough = 0;
  }

  setColor(id) { this.color = SD.COLORS.find(c => c.id === id) || SD.COLORS[0]; }
  setWeapon(id) {
    this.weapon = SD.WEAPONS[id] || SD.WEAPONS.sword;
    this.boltT = 0; this.recoilT = 0; this.muzzleT = 0; this._bo = false; this._bc = false;   // 换枪=满膛待发
    this.burstLeft = 0; this.burstT = 0; this.burstIdx = 0;
    this.windT = -1; this.aimWarn = false; this.aimRemain = 99; this._lockAim = null;
  }
  setHelmet(id) { this.helmet = SD.HELMETS[id] || SD.HELMETS.none; }

  get hmod() { return this.helmet.mod || {}; }
  get maxSpeed() { return 5.2 * this.weapon.speed * (1 + (this.hmod.spd || 0)); }
  get dmgMul() {
    let m = 1;
    if (this.buffT > 0) m += 0.35;
    if (this.hmod.berserk && this.hp < this.maxHp * 0.3) m += this.hmod.berserk;
    return m + (this.hmod.atk || 0);
  }

  /* ---------- 骨骼关键点 ---------- */
  joints() {
    const s = 1;                          // 比例
    // 奔跑时身体前倾（更炫的动感）
    const lean = this.ragdoll || this.dead ? 0 : Math.max(-1, Math.min(1, this.vx / 6));
    const hip = { x: this.x, y: this.y - 46 * s };
    const chest = { x: this.x + this.facing * 4 + lean * 7, y: this.y - 86 * s };
    const head = { x: chest.x + this.facing * 3 + lean * 5, y: chest.y - 26 * s };
    return { hip, chest, head, s };
  }

  bodyHit(px, py, r) {
    const { hip, chest, head } = this.joints();
    const pts = [[head, 17, 'head'], [chest, 19, 'body'], [hip, 17, 'body']];
    for (const [c, cr, zone] of pts) {
      const dx = px - c.x, dy = py - c.y, rr = r + cr;
      if (dx * dx + dy * dy < rr * rr) return zone;
    }
    return false;
  }

  /* ---------- 主更新 ---------- */
  update(dt, input, game) {
    if (this.dead) { this.deadT += dt; this.vx *= 0.9; this.x += this.vx * dt * 60; return; }
    const g = game.level.g;
    const frozen = this.hitstun > 0 || this.stun > 0;

    // ---- 计时器 ----
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.skillCd = Math.max(0, this.skillCd - dt);
    this.hitstun = Math.max(0, this.hitstun - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.armorT = Math.max(0, this.armorT - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.landSquash = Math.max(0, this.landSquash - dt);
    this.blinkGhost = Math.max(0, this.blinkGhost - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.buffT = Math.max(0, this.buffT - dt);
    // 大招 15 秒自动充能
    this.energy = Math.min(100, this.energy + dt * (100 / 15) * (1 + (this.hmod.eregen || 0)));
    if (this.weapon.gun) this.energy = 0;      // 枪械没有大招
    // 连击链计时
    this.hitChainT = Math.max(0, this.hitChainT - dt);
    if (this.hitChainT <= 0) this.hitChainN = 0;
    // 血条残影缓慢追踪
    if (this.hpGhost > this.hp) this.hpGhost = Math.max(this.hp, this.hpGhost - 45 * dt);
    else this.hpGhost = this.hp;

    // ---- 移动 ----
    if (!frozen && this.dashT <= 0) {
      const acc = this.onGround ? 0.9 : 0.5;
      if (input.left)  { this.vx -= acc; this.facing = -1; }
      if (input.right) { this.vx += acc; this.facing = 1; }
      const ms = this.maxSpeed;
      this.vx = Math.max(-ms, Math.min(ms, this.vx));
    }
    if (this.dashT > 0) this.dashT -= dt;

    // 摩擦
    this.vx *= this.onGround ? 0.82 : 0.96;

    // ---- 跳跃（按住=大跳）----
    if (this.onGround) this.coyote = 0.1; else this.coyote -= dt;
    if (!frozen && input.up && !input._upHeld && this.coyote > 0) {
      const jm = 1 + (this.hmod.jump || 0);
      this.vy = -12.5 * jm;
      this.onGround = false; this.coyote = 0; this.jumpHold = 0.24;
      SD.AudioMan.play('jump', { vol: 0.5 });
      SD.FX.dust(this.x, this.y, 6);
    }
    // 按住跳跃键延长上升（大跳）
    if (input.up && this.jumpHold > 0 && this.vy < 0) {
      this.vy -= 0.55; this.jumpHold -= dt;
    } else this.jumpHold = 0;
    // 快速下落
    if (!frozen && input.down && !this.onGround) this.vy += 1.1;

    // ---- 重力与位移 ----
    this.vy += g;
    if (this.vy > 18) this.vy = 18;
    const prevY = this.y;
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    // 边界
    if (this.x < 40) { this.x = 40; this.vx = 0; }
    if (this.x > SD.W - 40) { this.x = SD.W - 40; this.vx = 0; }

    // 布娃娃翻滚
    if (this.ragdoll) {
      this.rot += this.rotV * dt * 60;
      this.rotV *= 0.985;
    }
    this.dropThrough = Math.max(0, this.dropThrough - dt);

    // 落地处理（地面 + 单向平台）
    const doLand = (top) => {
      if (!this.onGround && this.vy > 6) {
        SD.FX.dust(this.x, top, 10);
        SD.AudioMan.play('land', { vol: 0.4 });
        this.landSquash = 0.12;
        if (this.slamPending > 0) this.doSlam(game, this.slamPending);
      }
      if (this.ragdoll) {  // 翻滚落地弹一下
        this.ragdoll = false; this.rot = 0;
        SD.FX.dust(this.x, top, 8);
        this.landSquash = 0.16;
      }
      this.y = top; this.vy = 0; this.onGround = true;
    };
    this.onGround = false;
    // 下穿平台
    if (input.down && this.onGround) this.dropThrough = 0;
    let landed = false;
    if (this.vy >= 0 && this.dropThrough <= 0 && game.level.plat) {
      for (const p of game.level.plat) {
        if (this.x > p.x - 10 && this.x < p.x + p.w + 10 && prevY <= p.y + 1 && this.y >= p.y) {
          doLand(p.y); landed = true; break;
        }
      }
    }
    if (!landed && this.y >= SD.GROUND) doLand(SD.GROUND);
    // 站在平台上按↓可穿下去
    if (input.down && this.onGround && this.y < SD.GROUND - 1) { this.dropThrough = 0.25; this.onGround = false; this.y += 3; }

    // 走路动画相位
    this.walkPhase += Math.abs(this.vx) * dt * 3.2;

    // ---- 朝向对手 ----
    const foe = game.foeOf(this);
    if (foe && !foe.dead && !frozen && this.attackT < 0 && this.dashT <= 0) {
      if (Math.abs(foe.x - this.x) > 8) this.facing = foe.x > this.x ? 1 : -1;
    }

    // ---- 普通攻击（近身自动挥击，与参考游戏一致）----
    if (!this.weapon.gun && !frozen && this.attackT < 0 && this.attackCd <= 0 && foe && !foe.dead && this.dashT <= 0) {
      const dx = Math.abs(foe.x - this.x), dy = Math.abs(foe.y - this.y);
      if (this.weapon.ranged) {
        if (dx < 560 && dx > 90 && dy < 120) this.startAttack(game);
      } else if (dx < this.weapon.range + 26 && dy < 90) {
        this.startAttack(game);
      }
    }

    // ---- 攻击进程 ----
    if (this.attackT >= 0) {
      this.attackT += dt;
      const k = this.attackT / this.attackDur;
      // 挥击音效 + 刀光特效（进入主动阶段时）
      if (k > 0.28 && this.swingSfxT === 0) {
        SD.AudioMan.play(this.weapon.ranged ? 'bowshot' : 'swing', { vol: 0.6 });
        this.swingSfxT = 1;
        if (!this.weapon.ranged) {
          const tip = this.weaponTip();
          SD.FX.playAnim(this.weapon.fx.trail, tip.hx, tip.hy, {
            rot: tip.ang, fps: 26,          // ang 已含朝向，无需镜像
            scale: 1.4 + this.weapon.range / 55,
          });
        }
      }
      // 命中判定窗口 30%~70%
      if (!this.hitFlag && k > 0.3 && k < 0.72 && foe && !foe.dead) {
        if (this.weapon.ranged) {
          this.fireArrow(game, this.weapon.dmg, 0);
          this.hitFlag = true;
        } else {
          const tip = this.weaponTip();
          const zone = foe.bodyHit(tip.x, tip.y, 26);
          if (zone) {
            const hitRes = foe.takeHit(this.weapon.dmg * this.dmgMul, this, {
              crit: zone === 'head' || Math.random() < ((this.weapon.crit || 0) + (this.hmod.crit || 0)),
              kx: this.facing * this.weapon.knock, ky: -3.5,
              combo: !!this._comboSwing, sfx: this.weapon.fx.sfx,
            });
            this.hitFlag = true;
            if (hitRes === false) {
              // 打中无敌帧目标：反震弹开，防止贴脸连打
              this.attackT = -1; this.attackCd = Math.max(this.attackCd, 0.34);
              this.vx = -this.facing * 9;
              this.vy = Math.min(this.vy, -2.2);
              SD.FX.burst(tip.x, tip.y, 12, { speed: 7, color: ['#ffffff', '#ffd23e', '#7ad9ff'], size: 4, life: 20, glow: true });
              SD.FX.text(foe.x, foe.y - 180, '弹开!', { color: '#ffd23e', size: 24, life: 34 });
              SD.AudioMan.play('clash', { vol: 0.85 });
              game.hitstop(0.045); game.shake(3.5);
            } else if (hitRes) {
              this.onDealHit(game, foe, tip.x, tip.y, zone === 'head');
            }
          }
        }
      }
      if (this.attackT >= this.attackDur) {
        this.attackT = -1; this.swingSfxT = 0;
        this.attackCd = this.weapon.cd;
        if (this.comboN > 0) {           // 连击（三连斩/疾风乱舞/无双）
          this.comboN--;
          this.attackCd = 0.1;
          this.attackT = 0; this.hitFlag = false; this.swingSfxT = 0;
          this.attackDur = this.weapon.swing * 0.8;
          this._comboSwing = true;
          if (this.flurryN > 0) this.flurryN--;
        } else this._comboSwing = false;
      }
    }

    // ---- 枪械：瞄准 / 拉栓 / 开火 ----
    if (this.weapon.gun) this.updateGun(dt, game, foe, frozen, input);
    else if (input) input.firePressed = 0;

    // ---- 技能 / 大招触发 ----
    if (!frozen) {
      if (input.skillPressed) { input.skillPressed = false; this.trySkill(game); }
      if (input.superPressed) { input.superPressed = false; this.trySuper(game); }
    } else { input.skillPressed = false; input.superPressed = false; }

    // 无双连段推进
    if (this.musouN > 0 && this.attackT < 0 && this.comboN === 0) {
      this.musouN--; this.comboN = 1; this.attackT = 0; this.hitFlag = false;
      this.attackDur = this.weapon.swing * 0.7;
      if (foe) this.facing = foe.x > this.x ? 1 : -1;
      this.vx = this.facing * 6;
    }
  }

  /* ================= 枪械：步枪 / 手枪 / 冲锋枪 =================
   *  rifle  栓动步枪：开一枪 → 拉栓 bolt(2.5) 秒 → 才能再开火
   *  pistol 手枪：    开一枪 → 间隔 bolt(1.5) 秒 → 才能再开火
   *  smg    冲锋枪：  一次开火连发 burst(3) 发（总伤害 = dmg）→ 连发结束后间隔 bolt(2.5) 秒
   *  玩家按开火键射击；AI 在射程内自动射击（开火前有 wind 秒的红色瞄准预警，最后 lock 秒锁定方向，可起跳躲避） */
  gunSpec() { return SD.Gear.SPEC[this.weapon.id] || SD.Gear.SPEC.zhongzheng; }

  /* 持枪姿态：返回 局部→世界 的坐标转换与枪口位置/方向 */
  gunPose() {
    const { chest } = this.joints();
    const f = this.facing, spec = this.gunSpec(), type = this.weapon.gunType || 'rifle';
    const px = chest.x + f * spec.hx, py = chest.y + spec.hy;
    const bob = (this.onGround && Math.abs(this.vx) > 0.8) ? Math.sin(this.walkPhase * 2) * 0.03 : 0;
    const rk = this.recoilT > 0 ? this.recoilT / (type === 'smg' ? 0.09 : 0.2) : 0;
    const th = this.aim + bob - rk * (type === 'pistol' ? 0.26 : type === 'smg' ? 0.07 : 0.2);   // 开枪时枪口上跳
    const kick = rk * (type === 'pistol' ? 4 : type === 'smg' ? 3 : 8);                         // 开枪时枪身后坐
    const c = Math.cos(th), sn = Math.sin(th);
    const toWorld = (lx, ly) => { const x = lx - kick; return { x: px + f * (x * c - ly * sn), y: py + x * sn + ly * c }; };
    const muzzle = toWorld(spec.xm, spec.my);
    muzzle.ang = f === 1 ? th : Math.PI - th;
    return { px, py, th, f, kick, toWorld, muzzle, rk };
  }

  /* 双手位置：前手托枪；后手握枪颈（步枪拉栓时移到拉栓柄上）；同时给出绘制枪所需的动画状态 */
  gunHands(pose) {
    const w = this.weapon, spec = this.gunSpec(), type = w.gunType || 'rifle';
    let rl = spec.rear;
    let bs = { open: 0, back: 0, grab: 0, slide: 0 };
    if (type === 'rifle') {
      if (this.boltT > 0) {
        bs = SD.Gear.boltState(w.bolt - this.boltT, w.bolt);
        const hg = SD.Gear.handleGeom(w.id, bs);
        rl = { x: rl.x + (hg.ex - rl.x) * bs.grab, y: rl.y + (hg.ey - rl.y) * bs.grab };
      }
    } else if (pose.rk > 0) {
      bs.slide = pose.rk > 0.5 ? 1 : pose.rk * 2;            // 套筒 / 枪机后坐再复位
    }
    return { rear: pose.toWorld(rl.x, rl.y), front: pose.toWorld(spec.front.x, spec.front.y), bs };
  }

  /* 两段式手臂（简易 IK）：肩 s → 手 h，肘部朝下弯 */
  limb(ctx, s, h, l1, l2) {
    let dx = h.x - s.x, dy = h.y - s.y, d = Math.hypot(dx, dy) || 1;
    const maxd = l1 + l2 - 0.5;
    if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
    const hx = s.x + dx, hy = s.y + dy;
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / d, uy = dy / d;
    const e1 = { x: s.x + ux * a - uy * hh, y: s.y + uy * a + ux * hh };
    const e2 = { x: s.x + ux * a + uy * hh, y: s.y + uy * a - ux * hh };
    const e = e1.y > e2.y ? e1 : e2;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.lineTo(hx, hy); ctx.stroke();
  }

  updateGun(dt, game, foe, frozen, input) {
    const w = this.weapon, B = w.bolt || 2.5, type = w.gunType || 'rifle';
    const WIND = w.wind || 0.5, LOCK = w.lock || 0.22;
    // 玩家开火是单次按键触发；消费输入，避免按住按键自动连射。
    const requestedFire = !this.isAI && input && input.firePressed ? true : false;
    if (input && !this.isAI) input.firePressed = 0;
    this.recoilT = Math.max(0, this.recoilT - dt);
    this.muzzleT = Math.max(0, this.muzzleT - dt);

    // 冲锋枪连发：被打断（受击硬直）则中止这一轮
    if (this.burstLeft > 0) {
      if (frozen) this.burstLeft = 0;
      else { this.burstT -= dt; if (this.burstT <= 0) this.shootOne(game, foe); }
    }

    // AI 的射程判定：与弩箭一致（水平 90~560，高度差 < 120）
    let inRange = false;
    if (this.isAI && foe && !foe.dead && this.dashT <= 0) {
      const dx = Math.abs(foe.x - this.x), dy = Math.abs(foe.y - this.y);
      inRange = dx < 560 && dx > 90 && dy < 120;
    }

    // 间隔计时（步枪=拉栓，手枪=复位，冲锋枪=换弹）+ 对应的机械音效
    let remain = 99;                                    // 距离 AI 开火还剩多少秒
    if (this.boltT > 0) {
      this.boltT = Math.max(0, this.boltT - dt);
      const el = B - this.boltT;                        // 已经过的间隔时间（冲锋枪连发期间为负）
      if (type === 'rifle') {
        const e = el * (2.5 / B);
        if (!this._bo && e >= 0.55) { this._bo = true; SD.AudioMan.play('bolt_open', { vol: 0.6 }); this.ejectCasing(); }
        if (!this._bc && e >= 2.05) { this._bc = true; SD.AudioMan.play('bolt_close', { vol: 0.6 }); }
      } else if (type === 'pistol') {
        if (!this._bc && el >= 0.3) { this._bc = true; SD.AudioMan.play('bolt_close', { vol: 0.3 }); }
      } else {
        if (!this._bo && el >= 0.6) { this._bo = true; SD.AudioMan.play('bolt_open', { vol: 0.45 }); }
        if (!this._bc && el >= 1.95) { this._bc = true; SD.AudioMan.play('bolt_close', { vol: 0.5 }); }
      }
      if (this.boltT > 0) remain = this.boltT; else this.windT = 0;   // 刚好结束：立刻进入开火判定
    }
    if (this.isAI) {
      if (this.boltT <= 0 && this.burstLeft <= 0) {
        // 已上膛：进入射程后需要先"瞄准" WIND 秒（换枪/开局第一枪同样如此）
        if (inRange && !frozen) { this.windT = this.windT < 0 ? WIND : this.windT - dt; remain = this.windT; }
        else this.windT = -1;
      }
      this.aimRemain = remain;
      this.aimWarn = inRange && !frozen && remain <= WIND;
    } else { this.aimWarn = false; this.aimRemain = 99; }
    const locked = this.aimWarn && remain <= LOCK;

    // 瞄准：枪口平滑指向对手胸口；AI 锁定后 / 连发期间不再跟踪
    if (locked) {
      if (this._lockAim == null) this._lockAim = this.aim;
      this.aim = this._lockAim;
    } else if (this.burstLeft <= 0) {
      this._lockAim = null;
      let target = -0.12;
      if (foe && !foe.dead) {
        const spec = this.gunSpec(), { chest } = this.joints(), fc = foe.joints().chest;
        const px = chest.x + this.facing * spec.hx, py = chest.y + spec.hy;
        target = Math.max(-0.5, Math.min(0.5, Math.atan2(fc.y - py, Math.abs(fc.x - px))));
      }
      this.aim += (target - this.aim) * Math.min(1, dt * 12);
    }

    // 开火：AI 自动（预警结束后）；玩家按开火键
    if (!frozen && this.boltT <= 0 && this.burstLeft <= 0 && foe && !foe.dead && this.dashT <= 0) {
      if (this.isAI) { if (inRange && remain <= 0) this.fireGun(game, foe); }
      else if (requestedFire) this.fireGun(game, foe);
    }
  }

  /* 开火：打出第一发，并启动间隔计时（冲锋枪的间隔从最后一发算起） */
  fireGun(game, foe) {
    const w = this.weapon, n = w.burst || 1, gap = w.burstGap || 0.09;
    this.burstIdx = 0;
    this.shootOne(game, foe);
    this.boltT = (w.bolt || 2.5) + (n - 1) * gap;
    this._bo = false; this._bc = false;
    this.windT = -1; this.aimWarn = false; this._lockAim = null;
  }

  /* 射出一发子弹（冲锋枪的三连发会连续调用三次；三发伤害拆成整数，总和 = dmg） */
  shootOne(game, foe) {
    const w = this.weapon, n = w.burst || 1, i = this.burstIdx++;
    const m = this.gunPose().muzzle;
    // 随机散布：近距离较准，越远越散；连发时枪口逐发上跳
    const dist = foe ? Math.abs(foe.x - this.x) : 300;
    const spread = (w.spreadBase != null ? w.spreadBase : 0.10) + dist * (w.spreadK != null ? w.spreadK : 0.0005);
    let a = m.ang + (Math.random() * 2 - 1) * spread;
    a += (this.facing === 1 ? -1 : 1) * 0.035 * i;
    const part = Math.floor(w.dmg / n) + (i < w.dmg % n ? 1 : 0);
    SD.FX.projectile({
      x: m.x, y: m.y, vx: Math.cos(a) * w.bulletSpeed, vy: Math.sin(a) * w.bulletSpeed,
      dmg: part * this.dmgMul, owner: this, type: 'bullet', r: n > 1 ? 4.5 : 5, tl: w.tracer,
      color: w.projColor || '#ffe9a8', sfx: w.fx.hitSfx || 'bullethit', knock: w.knock, life: 90,
    });
    SD.AudioMan.play(w.fx.shot || 'gun_han', { vol: n > 1 ? 0.6 : 0.85 });
    // 枪口火星 + 白烟（连发时减量，保证流畅）
    const light = n > 1;
    SD.FX.burst(m.x, m.y, light ? 4 : 8, { speed: 6, color: ['#fff3c4', '#ffcf60', '#ffffff'], size: light ? 2.8 : 3.5, life: 12, glow: true, vx: this.facing * 3 });
    SD.FX.burst(m.x + Math.cos(a) * 8, m.y + Math.sin(a) * 8, light ? 2 : 6, { speed: 2, color: ['#eceff3', '#c4cad3'], size: 6, life: 30, g: -0.03, vx: Math.cos(a) * 1.4 });
    if (w.gunType && w.gunType !== 'rifle') this.ejectCasing();
    this.muzzleT = 0.07; this.recoilT = light ? 0.09 : 0.2;
    this.vx -= this.facing * (light ? 0.4 : 1.2);       // 后坐力轻推
    game.shake(light ? 1.6 : 2.5);
    if (this.burstIdx < n) { this.burstLeft = n - this.burstIdx; this.burstT = w.burstGap || 0.09; }
    else this.burstLeft = 0;
  }

  ejectCasing() {
    const spec = this.gunSpec(), p = this.gunPose().toWorld(spec.ex, spec.ey);
    SD.FX.spawn(p.x, p.y, { vx: this.facing * (0.8 + Math.random() * 1.2), vy: -3.2 - Math.random(), g: 0.32, life: 46, size: 2.8, shrink: 0, color: '#e3b43f' });
  }

  drawGun(ctx, t) {
    const w = this.weapon, spec = this.gunSpec(), pose = this.gunPose(), hands = this.gunHands(pose);
    ctx.save();
    ctx.translate(pose.px, pose.py); ctx.scale(pose.f, 1); ctx.rotate(pose.th); ctx.translate(-pose.kick, 0);
    SD.Gear.gun(ctx, w.id, hands.bs);
    if (this.muzzleT > 0) SD.Gear.flash(ctx, spec.xm + 3, spec.my, (spec.flash || 1) * (1 + this.muzzleT * 4), Math.min(1, this.muzzleT / 0.05));
    ctx.restore();
    // 双手握在枪上（盖在枪身之上，看得到"握着"）
    const flash = this.hurtFlash > 0 && (this.hurtFlash * 30 | 0) % 2 === 0;
    ctx.fillStyle = flash ? '#ffffff' : this.color.main;
    ctx.beginPath(); ctx.arc(hands.rear.x, hands.rear.y, 4.6, 0, 6.29); ctx.fill();
    ctx.beginPath(); ctx.arc(hands.front.x, hands.front.y, 4.6, 0, 6.29); ctx.fill();
    // 瞄准预警线（AI 开火前）：虚线渐亮，最后 lock 秒变实线 —— 看到它就该起跳
    if (this.aimWarn && !this.dead) {
      const m = pose.muzzle, WIND = w.wind || 0.5, LOCK = w.lock || 0.22;
      const k = 1 - Math.max(0, this.aimRemain) / WIND, locked = this.aimRemain <= LOCK;
      ctx.save();
      ctx.strokeStyle = locked ? 'rgba(255,60,40,.85)' : 'rgba(255,80,50,' + (0.45 + 0.4 * k) + ')';
      ctx.lineWidth = locked ? 2.6 : 2;
      ctx.setLineDash(locked ? [] : [9, 9]);
      ctx.beginPath(); ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + Math.cos(m.ang) * 620, m.y + Math.sin(m.ang) * 620); ctx.stroke();
      ctx.restore();
    }
  }

  weaponTip() {
    // 武器尖端位置（随挥击弧线运动）
    const { chest } = this.joints();
    let a;
    if (this.attackT >= 0) {
      const k = Math.min(1, this.attackT / this.attackDur);
      // 弧线：后摆 -1.9 → 前劈 1.25
      const e = k < 0.3 ? (k / 0.3) * 0.5 : 0.5 + ((k - 0.3) / 0.7) * 1.5;
      a = -1.9 + e * 2.1;
    } else {
      a = -0.5 + Math.sin(this.walkPhase) * 0.12;   // 持械待机
    }
    const ang = this.facing === 1 ? a : Math.PI - a;
    const hx = chest.x + Math.cos(ang) * 34;
    const hy = chest.y + Math.sin(ang) * 34;
    return {
      x: hx + Math.cos(ang) * this.weapon.range,
      y: hy + Math.sin(ang) * this.weapon.range,
      hx, hy, ang,
    };
  }

  startAttack(game) {
    this.attackT = 0; this.hitFlag = false; this.swingSfxT = 0;
    this.attackDur = this.weapon.swing;
    // 挥击时身体前冲一小步（增强打击感）
    if (!this.weapon.ranged) this.vx += this.facing * 1.6;
  }

  fireArrow(game, dmg, angOff) {
    const { chest } = this.joints();
    const a = (this.facing === 1 ? 0 : Math.PI) + (angOff || 0);
    SD.FX.projectile({
      x: chest.x + this.facing * 30, y: chest.y,
      vx: Math.cos(a) * 15, vy: Math.sin(a) * 15,
      dmg: dmg * this.dmgMul, owner: this,
      type: this.weapon.projType || 'arrow', r: this.weapon.projType === 'fire' ? 15 : 8,
      color: this.weapon.projColor || '#dfe8ff',
      sfx: this.weapon.fx.hitSfx || 'hit',
    });
    SD.AudioMan.play('swing', { vol: 0.5 });
  }

  onDealHit(game, foe, x, y, crit) {
    this.energy = Math.min(100, this.energy + 3);   // 命中仅小幅加速充能
    game.onHitFeel(x, y, this.facing, crit);
    const ls = this.lifeSteal || (this.weapon.lifesteal || 0) || (this.hmod.life || 0) * this.maxHp;
    if (ls > 0) this.hp = Math.min(this.maxHp, this.hp + ls);
    // 20% 概率掉金币
    if (Math.random() < 0.2) SD.FX.coinBurst(x, y - 10, 1 + ((Math.random() * 2) | 0));
  }

  /* ---------- 受击 ---------- */
  takeHit(dmg, from, opt) {
    if (this.dead) return false;
    opt = opt || {};
    // 无敌帧：连打压制会被弹开（组合技段击除外，但伤害衰减）
    if (this.invulnT > 0) {
      if (!opt.combo) return false;
      dmg *= 0.5;
    }
    if (this.armorT > 0) dmg *= 0.4;                 // 无双霸体减伤
    dmg *= (1 - (this.hmod.def || 0));               // 头盔减伤
    if (opt.type === 'bullet') dmg *= (1 - (this.hmod.bdef || 0));   // 钢盔/军帽：削减子弹伤害
    if (opt.crit) dmg *= 1.5;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.energy = Math.min(100, this.energy + 2);
    this.hurtFlash = 0.18;
    if (!opt.combo) this.invulnT = 0.35;

    // 连击链：连续被打击退越来越远，必然被弹开
    this.hitChainN++; this.hitChainT = 1.4;
    const chainMul = 1 + 0.35 * (this.hitChainN - 1);

    const kres = (1 - (this.hmod.kres || 0)) * chainMul;
    if (this.armorT <= 0) {
      this.vx = (opt.kx || 0) * kres;
      this.vy = Math.min(this.vy, (opt.ky || -3) * kres);
      this.hitstun = opt.stun ? opt.stun : 0.28;
      this.attackT = -1; this.comboN = 0;            // 被打断
      this.onGround = false; this.y -= 1;
      // 强力击打 → 布娃娃空中翻滚（参考游戏标志性手感）
      if (Math.abs(this.vx) > 5 || opt.ky < -6 || opt.crit) {
        this.ragdoll = true;
        this.rotV = Math.sign(this.vx || this.facing) * (0.12 + Math.random() * 0.14);
        this.dropThrough = 0.3;   // 避免瞬间卡平台
      }
    }
    if (opt.stun) this.stun = Math.max(this.stun, opt.stun);

    SD.FX.damage(this.x, this.y - 130, dmg, opt.crit);
    SD.FX.blood(this.x, this.y - 80, opt.kx ? Math.sign(opt.kx) : 0);
    // 命中爆点使用攻击方武器色系
    if (from && from.weapon) SD.FX.burst(this.x, this.y - 80, 8, { speed: 6, color: from.weapon.fx.burst, size: 4, life: 20, glow: true });
    SD.AudioMan.play(opt.crit ? 'crit' : (opt.sfx || 'hit'), { vol: 0.8 });

    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.deadT = 0;
      SD.FX.burst(this.x, this.y - 70, 30, { speed: 8, color: [this.color.main, '#ffffff'], size: 5, life: 40 });
      SD.AudioMan.play('explode', { vol: 0.5 });
    }
    return true;
  }

  /* ---------- 技能 ---------- */
  cdrMul() { return 1 - (this.hmod.cdr || 0); }

  trySkill(game) {
    if (this.skillCd > 0 || this.dead || this.weapon.skill.type === 'none') return;   // 枪械没有小招
    const w = this.weapon, foe = game.foeOf(this);
    const setCd = () => this.skillCd = w.skill.cd * this.cdrMul();
    SD.AudioMan.play('skill', { vol: 0.7 });
    switch (w.skill.type) {
      case 'multislash':
        this.comboN = 2; this.attackCd = 0; this.attackT = 0; this.hitFlag = false;
        this.attackDur = w.swing * 0.7; break;
      case 'slam':
        this.vy = -10; this.vx = this.facing * 5; this.onGround = false;
        this.slamPending = 12; this.y -= 2; break;
      case 'dash':
        this.dashT = 0.26; this.vx = this.facing * 17; this.armorT = 0.26;
        this.attackT = 0; this.hitFlag = false; this.attackDur = 0.34; break;
      case 'blink': {
        if (foe && !foe.dead) {
          SD.FX.burst(this.x, this.y - 70, 12, { speed: 4, color: this.color.main, size: 4, life: 20 });
          this.x = Math.max(40, Math.min(SD.W - 40, foe.x - foe.facing * 64));
          this.facing = foe.x > this.x ? 1 : -1;
          this.blinkGhost = 0.3;
          this.attackT = 0; this.hitFlag = false; this.attackDur = w.swing;
        }
        break;
      }
      case 'drag':
        this.attackT = 0; this.hitFlag = false; this.attackDur = w.swing * 1.1;
        this.comboN = 0; this._dragBoost = true;
        SD.FX.projectile({ x: this.x + this.facing * 60, y: this.y - 60,
          vx: this.facing * 11, dmg: 8 * this.dmgMul, owner: this, type: 'wave',
          r: 12, color: '#9ae6ff', life: 50 });
        break;
      case 'spin': {
        this.attackT = 0; this.hitFlag = true; this.attackDur = 0.4; // 360°：手动判定
        game.aoeHit(this, this.x, this.y - 70, 115, w.dmg * this.dmgMul, { kx: 0, ky: -6 });
        SD.FX.burst(this.x, this.y - 70, 18, { speed: 7, color: '#cfe0ff', size: 4, life: 20, glow: true });
        break;
      }
      case 'triple':
        for (let i = -1; i <= 1; i++) this.fireArrow(game, w.dmg, i * 0.1);
        break;
      case 'crossfire':
        for (let i = -2; i <= 2; i++) this.fireArrow(game, w.dmg, i * 0.075);
        break;
      case 'fanout':
        for (let i = -2; i <= 2; i++) this.fireArrow(game, w.dmg * 0.8, i * 0.09);
        break;
      case 'buff':
        this.armorT = Math.max(this.armorT, 1.4);
        this.buffT = Math.max(this.buffT, 3.2);
        SD.FX.burst(this.x, this.y - 75, 22, { speed: 4, color: ['#cfe8ff', '#8fd8ff', '#fff'], size: 4, life: 24, glow: true });
        SD.FX.playAnim('slash_cyan', this.x, this.y - 80, { scale: 1.5, fps: 20 });
        break;
    }
    setCd();
    SD.FX.text(this.x, this.y - 150, w.skill.name + '!', { color: '#7ad9ff', size: 24 });
  }

  trySuper(game) {
    if (this.energy < 100 || this.dead || this.weapon.sup.type === 'none') return;   // 枪械没有大招
    const w = this.weapon, foe = game.foeOf(this);
    this.energy = 0;
    const supMul = 1 + (this.hmod.sup || 0);
    SD.AudioMan.play('super', { vol: 0.9 });
    game.flashSuper(this);
    SD.FX.text(this.x, this.y - 160, w.sup.name + '!!', { color: '#ffd23e', size: 34, life: 60 });
    switch (w.sup.type) {
      case 'wave':
        SD.FX.projectile({ x: this.x + this.facing * 50, y: this.y - 70,
          vx: this.facing * 13, dmg: 22 * supMul * this.dmgMul, owner: this,
          type: 'wave', r: 22, color: '#5ad9ff', life: 120, pierce: false });
        break;
      case 'thunder':
        this.vy = -11; this.onGround = false; this.y -= 2;
        this.slamPending = 26 * supMul; this._thunder = true; break;
      case 'sweep':
        game.aoeHit(this, this.x, this.y - 70, 170, 20 * supMul * this.dmgMul, { kx: this.facing * 14, ky: -7 });
        SD.FX.burst(this.x, this.y - 70, 30, { speed: 10, color: ['#ffd23e', '#fff'], size: 5, life: 26, glow: true });
        game.shake(10); break;
      case 'flurry':
        this.comboN = 5; this.flurryN = 5; this.attackCd = 0;
        this.attackT = 0; this.hitFlag = false; this.attackDur = w.swing * 0.6;
        this.vx = this.facing * 8; break;
      case 'dragon':
        SD.FX.projectile({ x: this.x + this.facing * 50, y: this.y - 80,
          vx: this.facing * 11, dmg: 28 * supMul * this.dmgMul, owner: this,
          type: 'dragon', r: 30, color: '#3ee6a0', life: 130, pierce: true, hitSet: new Set() });
        this.lifeSteal = 10; setTimeout(() => this.lifeSteal = 0, 3000); break;
      case 'musou':
        this.musouN = 4; this.armorT = 1.6; this.comboN = 1;
        this.attackT = 0; this.hitFlag = false; this.attackDur = w.swing * 0.7; break;
      case 'arrowrain': {
        const cx = foe ? foe.x : this.x + this.facing * 200;
        for (let i = 0; i < 12; i++) {
          SD.FX.projectile({
            x: cx - 140 + Math.random() * 280, y: -40 - Math.random() * 160,
            vx: 0, vy: 3 + Math.random() * 3, g: 0.35,
            dmg: 7 * supMul * this.dmgMul, owner: this,
            type: w.projType || 'arrow', r: w.projType === 'fire' ? 15 : 8, life: 220,
            color: w.projColor || '#dfe8ff', sfx: w.fx.hitSfx || 'hit',
          });
        }
        break;
      }
      case 'frost':
        game.aoeHit(this, this.x, this.y - 70, 210, 14 * supMul * this.dmgMul, { kx: 0, ky: -5, stun: 1.05 });
        SD.FX.burst(this.x, this.y - 75, 32, { speed: 9, color: ['#cfe8ff', '#8fd8ff', '#ffffff'], size: 5, life: 28, glow: true });
        SD.FX.playAnim('thunder', this.x, this.y - 80, { scale: 2.4, fps: 22 });
        game.shake(8);
        break;
      case 'phantom': {
        if (foe && !foe.dead) {
          SD.FX.burst(this.x, this.y - 70, 16, { speed: 6, color: '#e0b0ff', size: 4, life: 20, glow: true });
          this.x = Math.max(40, Math.min(SD.W - 40, foe.x - foe.facing * 78));
          this.facing = foe.x > this.x ? 1 : -1;
          this.blinkGhost = 0.4;
          this.comboN = 4; this.flurryN = 4; this.attackCd = 0;
          this.attackT = 0; this.hitFlag = false; this.attackDur = w.swing * 0.62;
          this.vx = this.facing * 7;
        }
        break;
      }
      case 'bless':
        this.hp = Math.min(this.maxHp, this.hp + 24 * supMul);
        this.armorT = Math.max(this.armorT, 2.2);
        SD.FX.burst(this.x, this.y - 80, 30, { speed: 6, color: ['#7dff9a', '#d8ffe8', '#fff'], size: 5, life: 26, glow: true });
        SD.FX.text(this.x, this.y - 170, '+HP', { color: '#7dff9a', size: 30, life: 60 });
        break;
      case 'meteor': {
        const cx = foe ? foe.x : this.x + this.facing * 220;
        for (let i = 0; i < 12; i++) {
          SD.FX.projectile({
            x: cx - 170 + Math.random() * 340, y: -50 - Math.random() * 180,
            vx: (Math.random() - 0.5) * 2, vy: 3.5 + Math.random() * 3, g: 0.32,
            dmg: 8 * supMul * this.dmgMul, owner: this, type: 'fire', r: 16, life: 260,
            color: '#ff9d2e', sfx: 'explode',
          });
        }
        break;
      }
    }
  }

  doSlam(game, dmg) {
    const isThunder = this._thunder; this._thunder = false;
    const radius = isThunder ? 190 : 130;
    game.aoeHit(this, this.x, SD.GROUND - 40, radius, dmg * this.dmgMul, { kx: 0, ky: -9, stun: isThunder ? 0.9 : 0 });
    SD.FX.dust(this.x, SD.GROUND, 26);
    SD.FX.burst(this.x, SD.GROUND - 10, 16, { speed: 8, color: isThunder ? '#ffd23e' : '#c9b48a', size: 5, life: 24, glow: isThunder, flat: true });
    if (isThunder) SD.FX.playAnim('thunder', this.x, SD.GROUND - 50, { scale: 2.6, fps: 22 });
    game.shake(isThunder ? 14 : 7);
    SD.AudioMan.play(isThunder ? 'explode' : 'land', { vol: 0.8 });
    this.slamPending = 0;
  }

  /* ---------- 绘制 ---------- */
  draw(ctx, t) {
    const { hip, chest, head } = this.joints();
    const c = this.color;
    const lw = 9;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // 死亡倒地 / 布娃娃翻滚：绕身体中心旋转
    let rot = this.ragdoll ? this.rot : 0;
    if (this.dead) rot = Math.min(1, this.deadT * 2.2) * (Math.PI / 2) * this.facing;
    if (rot) { ctx.translate(this.x, this.y - 60); ctx.rotate(rot); ctx.translate(-this.x, -(this.y - 60)); }
    if (this.landSquash > 0 && !rot) { const s = 1 - this.landSquash * 1.2; ctx.translate(this.x, this.y); ctx.scale(1 / s, s); ctx.translate(-this.x, -this.y); }

    const flash = this.hurtFlash > 0 && (this.hurtFlash * 30 | 0) % 2 === 0;
    const mainC = flash ? '#ffffff' : c.main;

    // 残影（影袭/冲刺）
    if (this.blinkGhost > 0 || this.dashT > 0) {
      ctx.globalAlpha = 0.25;
      this.drawBody(ctx, hip, chest, head, c.main, lw, t, true);
      ctx.globalAlpha = 1;
    }

    this.drawBody(ctx, hip, chest, head, mainC, lw, t, false);
    this.drawHelmet(ctx, head, t);
    this.drawWeapon(ctx, chest, t);

    // 能量满光圈
    if (this.energy >= 100 && !this.dead) {
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6);
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y - 60, 62 + Math.sin(t * 6) * 5, 0, 6.29); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawBody(ctx, hip, chest, head, color, lw, t, ghost) {
    const walking = Math.abs(this.vx) > 0.8 && this.onGround;
    const wp = this.walkPhase;
    const air = !this.onGround;

    // 腿（两段式）；布娃娃状态四肢狂摆
    const flail = this.ragdoll || this.dead;
    const ft = performance.now() / 90;
    const legSwing = flail ? Math.sin(ft) * 1.2 : (air ? 0.55 : (walking ? Math.sin(wp) * 0.75 : 0.12));
    const legSwing2 = flail ? Math.sin(ft + 2) * 1.2 : (air ? -0.3 : (walking ? Math.sin(wp + Math.PI) * 0.75 : -0.12));
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    const leg = (swing, bend) => {
      const kx = hip.x + Math.sin(swing) * 24, ky = hip.y + Math.cos(swing) * 24;
      const fx = kx + Math.sin(swing + bend) * 24, fy = ky + Math.cos(swing + bend) * 24;
      ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(kx, ky); ctx.lineTo(fx, Math.min(fy, this.y)); ctx.stroke();
    };
    leg(legSwing, air ? 0.9 : 0.25);
    leg(legSwing2, air ? 0.6 : 0.25);

    // 躯干
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(chest.x, chest.y); ctx.stroke();

    // 手臂（跑动大幅摆臂 / 跳跃举臂 / 挥击跟随武器）；持枪时双手托住步枪
    if (this.weapon.gun) {
      const pose = this.gunPose(), hands = this.gunHands(pose);
      ctx.globalAlpha *= 0.75; this.limb(ctx, chest, hands.rear, 22, 22); ctx.globalAlpha /= 0.75;
      this.limb(ctx, chest, hands.front, 22, 22);
    } else {
    let armA;
    if (this.attackT >= 0) {
      const k = Math.min(1, this.attackT / this.attackDur);
      armA = -1.9 + (k < 0.3 ? (k / 0.3) * 0.5 : 0.5 + ((k - 0.3) / 0.7) * 1.5) * 2.1;
    } else if (flail) armA = Math.sin(ft + 1) * 1.4;
    else if (air) armA = -2.3;                                // 空中举臂
    else armA = -0.5 + Math.sin(wp) * (walking ? 0.6 : 0.12); // 跑动摆臂
    const ang = this.facing === 1 ? armA : Math.PI - armA;
    // 后臂反相摆动
    const backAng = this.attackT >= 0 ? ang + Math.PI * 0.72
      : (this.facing === 1 ? -0.5 + Math.sin(wp + Math.PI) * (walking ? 0.6 : 0.12)
                           : Math.PI - (-0.5 + Math.sin(wp + Math.PI) * (walking ? 0.6 : 0.12)));
    const arm = (a) => {
      const ex = chest.x + Math.cos(a) * 22, ey = chest.y + Math.sin(a) * 22;
      const hx2 = ex + Math.cos(a - 0.35) * 22, hy2 = ey + Math.sin(a - 0.35) * 22;
      ctx.beginPath(); ctx.moveTo(chest.x, chest.y); ctx.lineTo(ex, ey); ctx.lineTo(hx2, hy2); ctx.stroke();
    };
    ctx.globalAlpha *= 0.75; arm(backAng); ctx.globalAlpha /= 0.75;
    arm(ang);
    }

    // 头
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(head.x, head.y, 15, 0, 6.29); ctx.fill();
  }

  drawWeapon(ctx, chest, t) {
    if (this.weapon.gun) { this.drawGun(ctx, t); return; }
    const tip = this.weaponTip();
    const { hx, hy, ang } = tip;
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(ang);
    ctx.lineCap = 'round';
    const glow = this.energy >= 100;
    if (glow) { ctx.shadowColor = '#ffd23e'; ctx.shadowBlur = 12; }
    const w = this.weapon, kind = w.kind || w.id, R = w.range;
    switch (kind) {
      case 'sword':
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, 0); ctx.stroke();
        ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(R, 0); ctx.stroke();
        ctx.fillStyle = '#ffd23e'; ctx.fillRect(10, -9, 7, 18); break;
      case 'curved':
        ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13, 0); ctx.stroke();
        ctx.strokeStyle = w.fx.color; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(13, 0);
        ctx.quadraticCurveTo(R * 0.72, -11, R, -2); ctx.stroke();
        ctx.fillStyle = '#ffd23e'; ctx.fillRect(9, -8, 6, 16); break;
      case 'twin':
        ctx.strokeStyle = '#5a4a6a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.stroke();
        ctx.strokeStyle = w.fx.color; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(R, 0); ctx.stroke();
        ctx.rotate(0.55);
        ctx.strokeStyle = '#5a4a6a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.strokeStyle = w.fx.color; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(R * 0.78, 0); ctx.stroke(); break;
      case 'dagger':
        ctx.strokeStyle = '#3a3f52'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(R, 0); ctx.stroke();
        ctx.rotate(Math.PI * 0.72);
        ctx.strokeStyle = '#3a3f52'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.strokeStyle = '#9fb4d8'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(R * 0.7, 0); ctx.stroke(); break;
      case 'blade':
        ctx.strokeStyle = '#2a5a3a'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 26, 0); ctx.stroke();
        ctx.strokeStyle = w.fx.color; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(R - 26, 0);
        ctx.quadraticCurveTo(R - 6, -14, R + 8, -4); ctx.stroke();
        ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(R - 26, 0, 6, 0, 6.29); ctx.fill(); break;
      case 'spear':
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 18, 0); ctx.stroke();
        ctx.fillStyle = '#dfe8ff';
        ctx.beginPath(); ctx.moveTo(R, 0); ctx.lineTo(R - 20, -8); ctx.lineTo(R - 20, 8); ctx.fill(); break;
      case 'halberd':
        ctx.strokeStyle = '#6a4a8a'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 20, 0); ctx.stroke();
        ctx.strokeStyle = '#e8d9ff'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(R - 20, -14); ctx.quadraticCurveTo(R + 4, 0, R - 20, 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R - 20, 0); ctx.lineTo(R + 4, 0); ctx.stroke(); break;
      case 'hammer':
        ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 16, 0); ctx.stroke();
        ctx.fillStyle = '#9aa3b8';
        ctx.fillRect(R - 24, -18, 24, 36);
        ctx.fillStyle = '#c8d2e8'; ctx.fillRect(R - 20, -14, 8, 28); break;
      case 'twinhammer':
        ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 14, 0); ctx.stroke();
        ctx.fillStyle = '#c9b48a';
        ctx.fillRect(R - 20, -15, 20, 30);
        ctx.fillStyle = '#fff0c0'; ctx.fillRect(R - 17, -11, 7, 22);
        ctx.rotate(0.7);
        ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 0.58, 0); ctx.stroke();
        ctx.fillStyle = '#c9b48a'; ctx.fillRect(R * 0.58 - 4, -12, 18, 24); break;
      case 'axe':
        ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 20, 0); ctx.stroke();
        ctx.fillStyle = '#9aa3b8';
        ctx.beginPath();
        ctx.moveTo(R - 26, 0); ctx.lineTo(R - 6, 0); ctx.lineTo(R - 12, -24); ctx.lineTo(R - 30, -20);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d8e0f0'; ctx.fillRect(R - 18, -12, 7, 12); break;
      case 'mace':
        ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 18, 0); ctx.stroke();
        ctx.fillStyle = '#8a8fa8';
        ctx.beginPath(); ctx.arc(R - 12, 0, 15, 0, 6.29); ctx.fill();
        for (let i = 0; i < 8; i++) {
          const a = i * 0.785, sx = R - 12 + Math.cos(a) * 15, sy = Math.sin(a) * 15;
          ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * 8, sy + Math.sin(a) * 8); ctx.stroke();
        } break;
      case 'flail':
        ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 34, 0); ctx.stroke();
        ctx.strokeStyle = '#a89070'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(R - 34, 0); ctx.quadraticCurveTo(R - 20, -12, R - 10, -4); ctx.stroke();
        ctx.fillStyle = '#9aa3b8';
        ctx.beginPath(); ctx.arc(R - 6, -4, 10, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(R - 8, -8, 4, 8); break;
      case 'whip':
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.stroke();
        ctx.strokeStyle = '#c8b090'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.quadraticCurveTo(R * 0.5, -14, R, -2); ctx.stroke();
        ctx.fillStyle = '#ffd23e'; ctx.fillRect(R - 6, -5, 10, 10); break;
      case 'bow':
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(10, 0, 30, -1.2, 1.2); ctx.stroke();
        ctx.strokeStyle = '#e8e0c8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(10 + Math.cos(-1.2) * 30, Math.sin(-1.2) * 30);
        ctx.lineTo(10 + Math.cos(1.2) * 30, Math.sin(1.2) * 30); ctx.stroke(); break;
      case 'crossbow':
        ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(28, 0); ctx.stroke();
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(-4, -8, 16, 16);
        ctx.strokeStyle = '#b89060'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(28, 0, 18, -1.1, 1.1); ctx.stroke();
        ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(28 + Math.cos(-1.1) * 18, Math.sin(-1.1) * 18);
        ctx.lineTo(28 + Math.cos(1.1) * 18, Math.sin(1.1) * 18); ctx.stroke(); break;
      case 'throwing':
        for (let i = -1; i <= 1; i++) {
          ctx.save(); ctx.rotate(i * 0.38);
          ctx.strokeStyle = '#3a3f52'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.stroke();
          ctx.fillStyle = '#cfe0ff';
          ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(12, -6); ctx.lineTo(12, 6); ctx.fill();
          ctx.restore();
        } break;
      case 'staff':
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, 0); ctx.stroke();
        ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(R - 18, 0); ctx.lineTo(R - 4, 0); ctx.stroke(); break;
      case 'claw':
        ctx.strokeStyle = '#4a3a5a'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.stroke();
        ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 5;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(18, i * 4);
          ctx.quadraticCurveTo(R * 0.7, i * 10 - 4, R, i * 16 - 4); ctx.stroke();
        } break;
      case 'fan':
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.stroke();
        ctx.fillStyle = 'rgba(180,220,255,.7)';
        ctx.beginPath(); ctx.moveTo(20, 0);
        ctx.arc(20, 0, 30, -1.25, 1.25); ctx.lineTo(20, 0); ctx.fill();
        ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(20 + Math.cos(i * 0.6) * 30, Math.sin(i * 0.6) * 30); ctx.stroke();
        } break;
      case 'firearm':
        ctx.strokeStyle = '#3a3a52'; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 18, 0); ctx.stroke();
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(R - 26, -12, 22, 24);
        ctx.fillStyle = '#ff9d2e';
        ctx.beginPath(); ctx.arc(R - 10, -4, 8, 0, 6.29); ctx.fill(); break;
      default:
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, 0); ctx.stroke();
        ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(R, 0); ctx.stroke(); break;
    }
    ctx.restore();

    // 挥击残影弧
    if (this.attackT >= 0) {
      const k = this.attackT / this.attackDur;
      if (k > 0.3 && k < 0.75) {
        ctx.save();
        ctx.globalAlpha = 0.3 * (1 - (k - 0.3) / 0.45);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10;
        ctx.beginPath();
        const r = this.weapon.range + 20;
        const a0 = (this.facing === 1 ? -1.9 + (k * 2.1) : Math.PI - (-1.9 + k * 2.1));
        ctx.arc(chest.x, chest.y, r, a0 - this.facing * 0.7, a0, this.facing < 0);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawHelmet(ctx, head, t) {
    const f = this.facing;
    ctx.save(); ctx.translate(head.x, head.y);
    switch (this.helmet.id) {
      case 'none':
        ctx.strokeStyle = '#e03a2a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, -2, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-f * 13, -6); ctx.lineTo(-f * 26, -12 + Math.sin(t * 4) * 3); ctx.stroke();
        break;
      case 'bronze':
        ctx.fillStyle = '#a8783a';
        ctx.beginPath(); ctx.arc(0, -4, 16, Math.PI, 0); ctx.fill();
        ctx.fillRect(-16, -6, 32, 5); break;
      case 'phoenix':
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath(); ctx.arc(0, -4, 16, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-10, -14); ctx.quadraticCurveTo(-24, -26, -20, -34); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, -14); ctx.quadraticCurveTo(24, -26, 20, -34); ctx.stroke(); break;
      case 'beast':
        ctx.fillStyle = '#7a3a3a';
        ctx.beginPath(); ctx.arc(0, -4, 16, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(-12, -16); ctx.lineTo(-8, -28); ctx.lineTo(-4, -16); ctx.fill();
        ctx.beginPath(); ctx.moveTo(12, -16); ctx.lineTo(8, -28); ctx.lineTo(4, -16); ctx.fill(); break;
      case 'zhuge':
        ctx.fillStyle = '#e8e0d0';
        ctx.beginPath(); ctx.arc(0, -4, 16, Math.PI, 0); ctx.fill();
        ctx.fillRect(-4, -30, 8, 14); break;
      case 'bawang':
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath(); ctx.arc(0, -4, 16, Math.PI, 0); ctx.fill();
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 10 - 4, -16); ctx.lineTo(i * 10, -30); ctx.lineTo(i * 10 + 4, -16); ctx.fill(); }
        break;
      case 'cloak':
        ctx.strokeStyle = '#c05a8a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, -2, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        ctx.fillStyle = 'rgba(192,90,138,.8)';
        ctx.beginPath(); ctx.moveTo(-f * 10, 10);
        ctx.quadraticCurveTo(-f * 40, 30 + Math.sin(t * 3) * 6, -f * 30, 70);
        ctx.lineTo(-f * 8, 40); ctx.fill(); break;
      case 'berserk':
        ctx.fillStyle = '#3a2030';
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#ff3a2a';
        ctx.beginPath(); ctx.arc(f * 6, -2, 3.5, 0, 6.29); ctx.fill();
        ctx.beginPath(); ctx.arc(-f * 5, -2, 3.5, 0, 6.29); ctx.fill(); break;
      case 'iron':
        ctx.fillStyle = '#3a4258';
        ctx.beginPath(); ctx.arc(0, -4, 17, Math.PI, 0); ctx.fill();
        ctx.fillRect(-17, -6, 34, 6);
        ctx.fillStyle = '#8a93a8'; ctx.fillRect(-14, -14, 28, 4); break;
      case 'dragon':
        ctx.fillStyle = '#8a3a2a';
        ctx.beginPath(); ctx.arc(0, -4, 17, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath(); ctx.moveTo(-14, -15); ctx.quadraticCurveTo(0, -30, 14, -15);
        ctx.lineTo(8, -18); ctx.lineTo(0, -26); ctx.lineTo(-8, -18); ctx.closePath(); ctx.fill(); break;
      case 'moon':
        ctx.fillStyle = '#3a4a7a';
        ctx.beginPath(); ctx.arc(0, -4, 16, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#e8f0ff';
        ctx.beginPath(); ctx.arc(-4, -20, 10, Math.PI * 0.9, Math.PI * 1.9); ctx.fill(); break;
      case 'jade':
        ctx.fillStyle = '#2a5a4a';
        ctx.beginPath(); ctx.arc(0, -4, 16, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#7dffb0';
        ctx.beginPath(); ctx.arc(0, -24, 6, 0, 6.29); ctx.fill();
        ctx.fillRect(-2, -18, 4, 10); break;
      case 'lion':
        ctx.fillStyle = '#8a5a2a';
        ctx.beginPath(); ctx.arc(0, -4, 17, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#ffd23e';
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(i * 9 - 4, -14); ctx.lineTo(i * 10, -26); ctx.lineTo(i * 9 + 4, -14); ctx.fill();
        } break;
      default:    // 二战中国钢盔 / 军帽（贴图在 gear.js）
        if (SD.Gear) SD.Gear.drawHelmet(ctx, this.helmet.id, f, t);
    }
    ctx.restore();
  }

  /* 大厅预览用静态绘制 */
  static drawPreview(canvas, cfg, t) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tmp = new SD.Player({ side: 1, x: 0, color: cfg.color, weapon: cfg.weapon, helmet: cfg.helmet });
    tmp.y = 0; tmp.facing = 1;
    tmp.walkPhase = Math.sin(t * 2) * 0.2;
    if (tmp.weapon.gun) {            // 大厅里循环演示：步枪=开火→拉栓；手枪=单发；冲锋枪=三连发
      const gw = tmp.weapon, B = gw.bolt || 2.5, type = gw.gunType || 'rifle', ph = t % (B + 1.8);
      tmp.aim = -0.05;
      if (type === 'smg') {
        const k = ph % 0.09, shooting = ph < 0.27;
        tmp.recoilT = shooting ? 0.09 - k : 0; tmp.muzzleT = shooting && k < 0.05 ? 0.07 - k : 0;
      } else {
        tmp.boltT = type === 'rifle' && ph < B ? B - ph : 0;
        const rmax = 0.2;
        tmp.recoilT = ph < rmax ? rmax - ph : 0; tmp.muzzleT = ph < 0.07 ? 0.07 - ph : 0;
      }
    }
    ctx.save();
    ctx.scale(0.62, 0.62);
    ctx.translate(110 / 0.62, 232 / 0.62);   // 角色原点在脚下
    tmp.draw(ctx, t);
    ctx.restore();
  }
};
