/* ===== ai.js AI 对手（状态机：接近/游走/进攻/闪避/拾取金币） ===== */
window.SD = window.SD || {};

SD.AI = class {
  constructor(player, diff) {
    this.p = player;
    this.diff = diff;   // 0简单 1普通 2困难
    this.thinkT = 0;
    this.plan = { left: false, right: false, up: false, down: false };
    this.aggro = [0.45, 0.7, 0.92][diff];       // 进攻欲望
    this.react = [0.5, 0.32, 0.18][diff];        // 思考间隔
    this.skillIQ = [0.15, 0.45, 0.8][diff];      // 技能使用率
    this.retreatHp = [0.1, 0.2, 0.32][diff];     // 低于此血量会拉开距离
    this.busyT = 0;                               // 出招/受击后的后摇
    this.retreatT = 0;                            // 主动拉开距离的冷却
  }

  /** 每帧返回 input 对象（由 game 调用） */
  input(dt, game) {
    const p = this.p, foe = game.foeOf(p);
    const inp = {
      left: false, right: false, up: false, down: false,
      skillPressed: false, superPressed: false, _upHeld: this._upHeld || false,
    };
    if (!foe || p.dead || foe.dead) return inp;

    // 参考原版：出招/受击后有硬直，不会原地连续贴身
    this.busyT = Math.max(0, this.busyT - dt);
    this.retreatT = Math.max(0, this.retreatT - dt);
    if (p.attackT >= 0 || p.hitstun > 0 || p.stun > 0) {
      this.busyT = Math.max(this.busyT, p.attackT >= 0 ? 0.45 : 0.38);
    }
    if (p.attackCd > 0.35) this.retreatT = Math.max(this.retreatT, 0.3);

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = this.react * (0.7 + Math.random() * 0.6);
      const dx = foe.x - p.x, adx = Math.abs(dx);
      const dir = dx > 0 ? 'right' : 'left';
      const pl = this.plan;
      pl.left = pl.right = pl.up = pl.down = false;

      const lowHp = p.hp < p.maxHp * this.retreatHp;
      const rng = p.weapon.aiRange || p.weapon.range;      // 枪械 AI 保持中远距离
      if (p.weapon.gun && p.boltT > 0.3 && adx < 230) this.retreatT = Math.max(this.retreatT, 0.3);   // 拉栓时被逼近就拉开距离
      if (this.busyT > 0 || this.retreatT > 0) {
        // 后摇/受击：拉开身位，不硬刚
        pl[dir === 'right' ? 'left' : 'right'] = true;
        if (Math.random() < 0.3) pl.up = true;
      } else {
        // 附近有金币且安全 → 去捡
        let coin = null, cd = 1e9;
        for (const c of SD.FX.coins) {
          const d = Math.abs(c.x - p.x);
          if (d < cd) { cd = d; coin = c; }
        }
        if (coin && cd < 260 && (adx > 220 || Math.random() < 0.4)) {
          pl[coin.x > p.x ? 'right' : 'left'] = true;
        } else if (lowHp && adx < 200 && Math.random() < 0.6) {
          pl[dir === 'right' ? 'left' : 'right'] = true;   // 拉开距离
          if (Math.random() < 0.3) pl.up = true;
        } else if (adx > rng + 10) {
          pl[dir] = true;                                   // 接近
          if (Math.random() < 0.06 * this.aggro) pl.up = true;  // 偶尔跳
        } else if (adx < rng * 0.45 && Math.random() < 0.45) {
          // 贴脸区：优先撤步，避免面对面硬打
          pl[dir === 'right' ? 'left' : 'right'] = true;
          if (Math.random() < 0.3) pl.up = true;
        } else {
          // 射程内：游走 + 概率后退骗刀
          const r = Math.random();
          if (r < 0.25) pl[dir === 'right' ? 'left' : 'right'] = true;
          else if (r < 0.5) pl[dir] = true;
          if (Math.random() < 0.08) pl.up = true;
        }
      }
      // 快速下落
      if (!p.onGround && p.vy > 2 && Math.random() < 0.3) pl.down = true;

      // 技能决策（出招后进入后摇，避免连续贴脸）
      if (p.weapon.skill.type !== 'none' && this.busyT <= 0 && p.skillCd <= 0 && Math.random() < this.skillIQ * 0.5) {
        const rangedOK = ['triple', 'crossfire', 'fanout'].includes(p.weapon.skill.type);
        if (adx < 260 || rangedOK) {
          inp.skillPressed = true;
          this.busyT = Math.max(this.busyT, 0.7);
        }
      }
      if (p.weapon.sup.type !== 'none' && this.busyT <= 0 && p.energy >= 100 && Math.random() < this.skillIQ) {
        const rangedSup = ['wave', 'dragon', 'arrowrain', 'meteor', 'frost', 'bless'].includes(p.weapon.sup.type);
        if (adx < 420 || rangedSup) {
          inp.superPressed = true;
          this.busyT = Math.max(this.busyT, 1.0);
        }
      }
      if (inp.skillPressed || inp.superPressed) this.retreatT = Math.max(this.retreatT, 0.5);
    }
    Object.assign(inp, this.plan);
    // 躲子弹：对手（AI）的枪出现红色瞄准预警时，按难度概率在开火前后起跳，让子弹从身下飞过
    this.dodgeT = Math.max(0, (this.dodgeT || 0) - dt);
    if (foe.weapon.gun && foe.aimWarn) {
      if (!this._dodgeRolled) {
        this._dodgeRolled = true;
        this._dodgeGo = Math.random() < [0.3, 0.55, 0.8][this.diff];
        this._dodgeAt = 0.02 + Math.random() * 0.14;          // 开火前多久起跳（带随机，避免每次都完美）
      }
      if (this._dodgeGo && p.onGround && foe.aimRemain <= this._dodgeAt) {
        this._dodgeGo = false; this.dodgeT = 0.32; this._upHeld = false;
      }
    } else { this._dodgeRolled = false; this._dodgeGo = false; }
    if (this.dodgeT > 0) inp.up = true;
    // 按住跳 = 大跳
    if (inp.up) { inp._upHeld = this._upHeld || false; this._upHeld = true; }
    else this._upHeld = false;
    inp.up = inp.up && !this._upEdge ? true : inp.up; // 简单处理：up 持续有效
    return inp;
  }
};
