/* ===== gear.js 二战中国步枪 / 军帽钢盔 的程序化贴图 =====
 * 全部用 canvas 矢量绘制（粗圆头线条 + 深色描边），与火柴人风格统一：
 *   - SD.Gear.rifle(ctx, id, st)      在局部坐标画一支步枪（原点=持枪点，枪口朝 +x，朝上为 -y）
 *   - SD.Gear.drawHelmet(ctx, id, f, t)  在头部中心(0,0)画军帽/钢盔，f=朝向(1/-1)
 *   - SD.Gear.icon(kind, id)          生成大厅选择页用的图标(dataURL, 带缓存)
 *   - SD.Gear.drawWeaponIcon(...)     掉落气泡 / HUD 里画武器图标（枪械用贴图，其余用 emoji）
 */
window.SD = window.SD || {};

SD.Gear = (function () {
  const OUT = '#1c1824';
  const C = {
    wood: '#a9733a', woodD: '#6c4522', woodL: '#d19c5f',
    steel: '#cfd7e3', steelM: '#93a0b4', steelD: '#566176', blue: '#3b4559',
    brass: '#e3b43f', leather: '#6b4a2a',
  };

  /* ---------- 小工具 ---------- */
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.6; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function rect(ctx, x, y, w, h, fill, stroke, lw) {
    poly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, stroke, lw);
  }
  function line(ctx, x1, y1, x2, y2, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function disc(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
  }
  function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function star5(ctx, x, y, r, fill) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  /* 青天白日徽（蓝底白日） */
  function sunBadge(ctx, x, y, r) {
    disc(ctx, x, y, r, '#2457c7', '#12307a', 1);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a - 0.14) * r * 0.45, y + Math.sin(a - 0.14) * r * 0.45);
      ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
      ctx.lineTo(x + Math.cos(a + 0.14) * r * 0.45, y + Math.sin(a + 0.14) * r * 0.45);
      ctx.closePath(); ctx.fill();
    }
    disc(ctx, x, y, r * 0.42, '#ffffff');
  }

  /* ================= 步枪 ================= */
  /* L=全长  fe=木托前端x  hand=上护木长度  jacket=套筒  box=外露弹仓  dust=防尘盖  bayo=刺刀  sling=背带 */
  const BUTT = -31;
  const SPEC = {
    laotaotong: { L: 112, fe: 50, jacket: true,  box: true,  straight: true,  bands: [42], rod: true,  barrelW: 4.2 },
    hanyang:    { L: 108, fe: 64, jacket: false, box: true,  straight: true,  bands: [40, 58], barrelW: 5.6 },
    sanba:      { L: 120, fe: 72, hand: 40, dust: true, bands: [46, 66], sling: true, barrelW: 3.8, slim: true },
    zhongzheng: { L: 100, fe: 58, hand: 30, bayo: true, bands: [56], barrelW: 4.6, lug: true },
    k98:        { L: 96,  fe: 54, hand: 28, bands: [52], sling: true, disc: true, barrelW: 4.6 },
    /* —— 抗战 / 内战常用的其它栓动步枪 —— */
    mosin:      { L: 118, fe: 80, hand: 46, spike: true, ext: 30, bands: [42, 60, 78], sling: true, barrelW: 4.4 },        // 莫辛-纳甘（苏援，常带刺刀）
    smle:       { L: 108, fe: 68, hand: 34, nose: true, box: true, boxBig: true, bands: [44], barrelW: 4.6 },             // 李-恩菲尔德（英援，远征军）
    springfield:{ L: 106, fe: 58, hand: 30, ladder: true, bands: [40, 54], sling: true, barrelW: 4.4 },                    // 春田 M1903（美援）
    type44:     { L: 88,  fe: 46, hand: 24, foldSpike: true, ext: 20, bands: [44], barrelW: 4.4, lug: false },              // 四四式骑枪（折叠刺刀，缴获）
    /* —— 手枪（设计坐标 ×PK 放大，便于在火柴人手里看清）—— */
    c96:      { type: 'pistol', L: 40, bx: -10, mx: 38, my: -5.2, ih: 22 },     // 驳壳枪（毛瑟 C96，盒子炮）
    m1911:    { type: 'pistol', L: 34, bx: -8,  mx: 27, my: -6.6, ih: 22 },     // 柯尔特 M1911（美援）
    tt33:     { type: 'pistol', L: 32, bx: -7,  mx: 25, my: -6,   ih: 22 },     // 托卡列夫 TT-33（苏援）
    nambu14:  { type: 'pistol', L: 34, bx: -9,  mx: 27, my: -6,   ih: 22 },     // 南部十四年式（缴获）
    webley:   { type: 'pistol', L: 36, bx: -9,  mx: 32, my: -5.6, ih: 24 },     // 韦伯利左轮（英援）
    /* —— 冲锋枪 —— */
    thompson: { type: 'smg', L: 80, bx: -26, mx: 54, my: -5, ih: 36 },          // 汤姆逊 M1928
    ppsh:     { type: 'smg', L: 84, bx: -26, mx: 58, my: -5, ih: 36 },          // 波波沙 PPSh-41
    mp28:     { type: 'smg', L: 78, bx: -26, mx: 52, my: -5, ih: 30 },          // 伯格曼 MP28
    sten:     { type: 'smg', L: 78, bx: -26, mx: 52, my: -3.6, ih: 30 },        // 司登 Mk II
  };
  const PK = 1.35;                                    // 手枪放大倍数
  /* 补全每支枪的几何：持枪支点(hx,hy)、枪口(xm,my)、双手位置(rear/front)、抛壳口(ex,ey)、火光大小 */
  Object.keys(SPEC).forEach(id => {
    const g = SPEC[id];
    g.type = g.type || 'rifle';
    if (g.type === 'rifle') {
      g.butt = BUTT; g.xm = BUTT + g.L; g.my = -3.5; g.hx = 6; g.hy = 9; g.ex = 14; g.ey = -8;
      g.rear = { x: 3, y: 4 }; g.front = { x: 30, y: 3.5 }; g.flash = 1; g.ih = 28; g.ext = g.ext || (g.bayo ? 10 : 0);
    } else if (g.type === 'smg') {
      g.butt = g.bx; g.xm = g.mx; g.hx = 6; g.hy = 9; g.ex = 10; g.ey = -8;
      g.rear = { x: 3, y: 5 }; g.front = { x: 26, y: 5 }; g.flash = 0.8; g.ext = 0;
    } else {                                           // pistol：设计坐标 → 实际像素
      g.k = PK; g.butt = g.bx * PK; g.xm = g.mx * PK; g.my = g.my * PK; g.hx = 30; g.hy = 4;
      g.ex = 4 * PK; g.ey = -8 * PK; g.rear = { x: -2 * PK, y: 6 * PK }; g.front = { x: 0 * PK, y: 11 * PK };
      g.flash = 0.7; g.ext = 0; g.ih = g.ih * PK;
    }
    g.cy = g.type === 'pistol' ? 5 : g.type === 'smg' ? 2 : 1;      // 图标垂直居中用
  });
  const xmOf = id => (SPEC[id] || SPEC.zhongzheng).xm;

  /* 拉栓动作：el = 开枪后经过的秒数(0~total) */
  function boltState(el, total) {
    total = total || 2.5;
    const k = total / 2.5;           // 其它总时长按比例缩放
    const e = el / k;
    let open = 0, back = 0;
    if (e < 0.2) open = 0;
    else if (e < 0.55) open = smooth((e - 0.2) / 0.35);
    else if (e < 2.05) open = 1;
    else if (e < 2.4) open = 1 - smooth((e - 2.05) / 0.35);
    if (e < 0.55) back = 0;
    else if (e < 1.05) back = smooth((e - 0.55) / 0.5);
    else if (e < 1.55) back = 1;
    else if (e < 2.05) back = 1 - smooth((e - 1.55) / 0.5);
    const grab = Math.min(smooth((e - 0.12) / 0.14), smooth((2.5 - e) / 0.14));
    return { open, back, grab };
  }

  /* 拉栓柄位置（局部坐标）：基座 b、末端 e（即旋钮中心） */
  function handleGeom(id, st) {
    const g = SPEC[id] || SPEC.zhongzheng;
    const open = (st && st.open) || 0, back = (st && st.back) || 0;
    const slide = back * 15;
    const bx = 7 - slide, by = -3.2;
    const hl = g.straight ? 10.5 : 9;
    const phi = open * Math.PI;                       // 绕枪膛轴线旋转：下 → 朝向镜头 → 上
    const cs = Math.cos(phi);
    const ex = bx - 3.2 * Math.abs(cs) - (g.straight ? 0 : 1), ey = by + hl * cs;
    return { bx, by, ex, ey, slide };
  }

  function rifle(ctx, id, st) {
    st = st || {};
    const g = SPEC[id] || SPEC.zhongzheng;
    const xm = BUTT + g.L;                             // 枪口 x
    const slide = (st.back || 0) * 15;
    const hg = handleGeom(id, st);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    /* 背带（最底层） */
    if (g.sling) {
      ctx.strokeStyle = C.leather; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-9, 11); ctx.quadraticCurveTo(22, 24, g.fe - 6, 6); ctx.stroke();
    }

    /* 枪管 */
    const bw = g.barrelW;
    rect(ctx, 16, -2.5 - bw / 2 - 0.5, xm - 16, bw, C.blue, OUT, 1.3);
    line(ctx, 18, -2.5 - bw / 2 + 1, xm - 1, -2.5 - bw / 2 + 1, '#6a7691', 1);

    /* 老套筒：枪管外的隔热钢套筒（名字由来） */
    if (g.jacket) {
      const jx1 = 22, jx2 = xm - 13;
      rect(ctx, jx1, -8, jx2 - jx1, 9, C.steel, OUT, 1.5);
      line(ctx, jx1 + 2, -6, jx2 - 2, -6, '#ffffff', 1.4);
      line(ctx, jx1 + 2, -0.8, jx2 - 2, -0.8, C.steelM, 1.2);
      rect(ctx, jx2 - 3, -8.6, 4, 10.2, C.steelM, OUT, 1.2);   // 套筒前箍
      rect(ctx, jx1 - 1, -8.6, 3.5, 10.2, C.steelM, OUT, 1.2); // 套筒后箍
    }

    /* 木托 */
    const fe = g.fe;
    const topFore = g.slim ? -1 : -1.5;
    const stock = [
      [BUTT, -8], [-14, -9.8], [-3, -5.8], [4, -4.4], [22, -4.4],
      [22, topFore], [fe, topFore], [fe, 4 + (g.slim ? -0.5 : 0)], [22, 4.6],
      [22, 9.5], [7, 9.5], [3, 6.6], [-4, 8.6], [-14, 10.8], [BUTT, 9.2],
    ];
    poly(ctx, stock, C.wood, OUT, 1.6);
    // 木纹高光 / 阴影
    line(ctx, BUTT + 3, -5.5, -12, -6.6, C.woodL, 1.6);
    line(ctx, -12, 8.2, BUTT + 3, 6.6, C.woodD, 1.4);
    line(ctx, 24, 2.4, fe - 2, 2.4, C.woodD, 1.2);
    // 枪托底板
    rect(ctx, BUTT - 1.2, -8.4, 3.6, 18, C.steelD, OUT, 1.2);
    if (g.disc) disc(ctx, -17, 3.5, 3.4, '#7d5a2d', OUT, 1.3);   // 98k 托身圆盘

    /* 上护木（盖住枪管上半） */
    if (g.hand) {
      rect(ctx, 22, -5.6, g.hand, 4.8, C.wood, OUT, 1.4);
      line(ctx, 24, -4.2, 22 + g.hand - 2, -4.2, C.woodL, 1.2);
    }

    /* 箍 */
    (g.bands || []).forEach(bx => {
      rect(ctx, bx, -6.4, 3.8, 11.4, C.steelM, OUT, 1.3);
    });
    // 木托前端箍帽
    if (!g.jacket) rect(ctx, fe - 2.5, -3.4, 3.8, 8, C.steelD, OUT, 1.2);

    /* 清洁杆（老套筒） */
    if (g.rod) line(ctx, 24, 5.4, fe + 3, 5.4, C.steelM, 1.6);

    /* 机匣 */
    rect(ctx, -3, -7.6, 26, 8.4, C.steelM, OUT, 1.6);
    line(ctx, -1, -5.8, 20, -5.8, '#e9eef7', 1.2);
    rect(ctx, 19, -8.2, 5, 9.4, C.steelD, OUT, 1.3);             // 机匣前环

    /* 外露弹仓（汉阳系：5发弹夹探出；李-恩菲尔德：10发可拆弹匣更大） */
    if (g.boxBig) {
      rect(ctx, 5, 3.4, 16, 12.4, C.steelD, OUT, 1.4);
      line(ctx, 7, 7, 19, 7, C.steelM, 1);
      for (let i = 0; i < 3; i++) disc(ctx, 9.6 + i * 4.2, 14.4, 1.7, C.brass, OUT, 0.8);
    } else if (g.box) {
      rect(ctx, 6, 3.4, 15, 7.6, C.steelD, OUT, 1.4);
      for (let i = 0; i < 3; i++) disc(ctx, 9.6 + i * 4.2, 10.6, 1.9, C.brass, OUT, 0.8);
    } else {
      rect(ctx, 6, 4, 15, 6, C.steelD, OUT, 1.3);
    }
    /* 扳机护圈 + 扳机 */
    ctx.strokeStyle = C.steelD; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-1, 5.4); ctx.quadraticCurveTo(2, 12.5, 7, 9.8); ctx.stroke();
    line(ctx, 3, 3.6, 3.6, 7.2, '#262030', 1.6);

    /* 拉栓：枪机 + 防尘盖 + 拉栓柄 */
    ctx.save();
    if (st.back) {
      // 机匣顶部露出的空槽（拉栓后可见）
      rect(ctx, 9, -7, 13, 3.4, '#20202c', null);
    }
    if (g.dust) {
      // 三八式防尘盖：随枪机前后移动，带横纹
      const dx = -slide;
      rect(ctx, 0 + dx, -9.6, 24, 4.4, C.steel, OUT, 1.4);
      for (let i = 0; i < 6; i++) line(ctx, 3 + dx + i * 3.6, -9, 3 + dx + i * 3.6, -6, C.steelM, 1);
    } else {
      rect(ctx, -6 - slide, -6.9, 18, 4.4, C.steel, OUT, 1.4);   // 枪机体
      rect(ctx, -9.5 - slide, -6.3, 4.4, 3.4, C.steelD, OUT, 1.2); // 击针尾
    }
    // 拉栓柄
    line(ctx, hg.bx, hg.by, hg.ex, hg.ey, OUT, 4.8);
    line(ctx, hg.bx, hg.by, hg.ex, hg.ey, C.steelM, 2.6);
    disc(ctx, hg.ex, hg.ey, 3.3, C.steel, OUT, 1.4);
    ctx.restore();

    /* 瞄具：照门 + 准星 */
    if (g.ladder) {                                   // 春田：高大的梯形照门
      poly(ctx, [[24, -8.2], [34, -8.2], [33, -15.5], [25.5, -15.5]], C.steelM, OUT, 1.2);
      line(ctx, 27, -13.8, 31.6, -13.8, OUT, 1.2);
      line(ctx, 29.3, -15.4, 29.3, -9.4, C.steelD, 1);
    } else if (g.dust) {
      poly(ctx, [[24, -8.6], [30, -8.6], [29, -11.2], [25, -11.2]], C.steelM, OUT, 1.1);
    } else {
      poly(ctx, [[26, -8.2], [34, -8.2], [32.5, -11], [27.5, -11]], C.steelM, OUT, 1.1);
    }
    poly(ctx, [[xm - 6, -2.5 - bw / 2 - 0.6], [xm - 3, -2.5 - bw / 2 - 0.6], [xm - 4.5, -2.5 - bw / 2 - 4]], C.steelD, OUT, 1);
    if (g.dust) { // 三八式准星护翼
      line(ctx, xm - 8, -9, xm - 8, -2.8, C.steelD, 1.6);
      line(ctx, xm - 1.5, -9, xm - 1.5, -2.8, C.steelD, 1.6);
    }
    /* 枪口帽 */
    rect(ctx, xm - 2, -2.5 - bw / 2 - 0.4, 2.8, bw + 0.8, C.steelD, OUT, 1);
    /* 李-恩菲尔德：木托前端的"鼻帽"+ 准星护翼 */
    if (g.nose) {
      rect(ctx, fe - 3, -7.4, 6, 13, C.steelM, OUT, 1.2);
      line(ctx, fe + 1, -7.4, fe + 1, -12.4, C.steelD, 1.8);
      line(ctx, fe - 2, -7.4, fe - 2, -11.4, C.steelD, 1.8);
    }
    /* 莫辛-纳甘：常年上着的细长刺刀（刺锥） */
    if (g.spike) {
      rect(ctx, xm - 12, -5.8, 10, 6.6, C.steelD, OUT, 1.2);
      poly(ctx, [[xm - 3, -3.6], [xm + 30, -2.4], [xm + 31.5, -1.4], [xm - 3, -0.2]], C.steel, OUT, 1.2);
      line(ctx, xm - 1, -2.6, xm + 27, -1.7, '#ffffff', 1);
    }
    /* 四四式骑枪：枪口下折叠刺刀（打开状态） */
    if (g.foldSpike) {
      disc(ctx, xm - 10, 1.6, 2.4, C.steelM, OUT, 1.1);
      poly(ctx, [[xm - 10, 0.4], [xm + 18, 2.4], [xm + 19, 3.6], [xm - 10, 3.2]], C.steel, OUT, 1.2);
      line(ctx, xm - 7, 1.6, xm + 15, 2.8, '#ffffff', 1);
    }

    /* 中正式：枪口下的刺刀 */
    if (g.bayo) {
      rect(ctx, xm - 14, 2.2, 8, 3.4, C.steelD, OUT, 1.2);     // 刺刀座
      poly(ctx, [[xm - 7, 2.6], [xm + 20, 3.4], [xm + 22, 4.4], [xm - 7, 5.4]], C.steel, OUT, 1.2);
      line(ctx, xm - 5, 3.6, xm + 17, 4, '#ffffff', 1);
    } else if (g.lug) {
      rect(ctx, xm - 14, 2.2, 6, 3, C.steelD, OUT, 1.1);
    }
    ctx.restore();

    return { xm, handle: hg };
  }


  /* ================= 手枪 ================= */
  /* 设计坐标：握把后上角约在原点，枪口朝 +x；整体再放大 PK 倍。st.slide(0~1)=套筒/枪机后坐量 */
  const PC = { slide: '#7b879d', slideD: '#4d576b', blk: '#2a2f3d', blkL: '#4a5266', grip: '#8a5a2e', gripD: '#4f2f16', steel: '#aab4c6' };
  function gripLines(ctx, x0, y0, x1, y1, n) {      // 握把防滑横纹
    for (let i = 1; i < n; i++) {
      const t = i / n;
      line(ctx, x0 + (x1 - x0) * t - 4, y0 + (y1 - y0) * t, x0 + (x1 - x0) * t + 4, y0 + (y1 - y0) * t, PC.gripD, 0.9);
    }
  }
  const PISTOLS = {
    m1911(ctx, sl) {
      poly(ctx, [[-7, -1], [4, -1], [2.5, 17], [-8.5, 17]], PC.grip, OUT, 1.4);        // 握把
      gripLines(ctx, -6, 2, 2, 15, 6);
      disc(ctx, -2.4, 6, 1, PC.gripD);                                                // 握把螺丝
      rect(ctx, -9, 16, 12, 2.6, PC.blk, OUT, 1.1);                                   // 弹匣底
      rect(ctx, -6, -2.8, 24, 5, PC.blk, OUT, 1.3);                                   // 枪身
      ctx.strokeStyle = PC.blk; ctx.lineWidth = 1.8; ctx.lineCap = 'round';           // 扳机护圈
      ctx.beginPath(); ctx.moveTo(6, 2); ctx.quadraticCurveTo(7, 8.5, 13, 5.6); ctx.lineTo(14, 2); ctx.stroke();
      line(ctx, 8.4, 1.4, 8.8, 4.6, PC.steel, 1.3);                                   // 扳机
      poly(ctx, [[-9, -9], [-5, -11], [-4, -7]], PC.blkL, OUT, 1);                    // 击锤
      // 套筒（开枪时后坐）
      const d = sl * 6;
      poly(ctx, [[-7 - d, -10], [26 - d * 0.1, -10], [27 - d * 0.1, -3], [-7 - d, -3]], PC.slide, OUT, 1.4);
      for (let i = 0; i < 4; i++) line(ctx, -4 - d + i * 1.7, -9.2, -4 - d + i * 1.7, -4, PC.slideD, 0.9);   // 后部防滑纹
      line(ctx, 2 - d, -8.6, 24 - d * 0.1, -8.6, '#dfe6f2', 1);
      rect(ctx, 24, -9.4, 3.4, 5.4, PC.blk, OUT, 1);                                  // 枪口
      poly(ctx, [[22.6, -10], [25, -10], [24, -12.4]], PC.blkL, OUT, 0.9);            // 准星
    },
    tt33(ctx, sl) {
      poly(ctx, [[-6, -1], [4, -1], [2.8, 17], [-7.4, 17]], PC.blk, OUT, 1.4);        // 握把（黑色塑料）
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) disc(ctx, -4.4 + j * 3.2 - i * 0.2, 3 + i * 3.4, 0.8, PC.blkL);   // 菱形纹
      rect(ctx, -8, 16, 11.4, 2.6, PC.blkL, OUT, 1.1);
      rect(ctx, -5.5, -2.8, 23, 5, PC.blk, OUT, 1.3);
      ctx.strokeStyle = PC.blk; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(5.5, 2); ctx.quadraticCurveTo(6, 8, 12, 5.4); ctx.lineTo(13, 2); ctx.stroke();
      line(ctx, 8, 1.4, 8.4, 4.4, PC.steel, 1.3);
      const d = sl * 5.5;
      poly(ctx, [[-6 - d, -9.6], [25 - d * 0.1, -9.6], [25 - d * 0.1, -3], [-6 - d, -3]], '#3a4152', OUT, 1.4);   // 方正的套筒
      for (let i = 0; i < 5; i++) line(ctx, -3.6 - d + i * 1.6, -9, -3.6 - d + i * 1.6, -4.4, PC.blkL, 0.9);
      line(ctx, 4 - d, -8.4, 22 - d * 0.1, -8.4, '#7d879c', 1);
      rect(ctx, 22.4, -8.6, 2.8, 4.6, PC.blkL, OUT, 1);
      poly(ctx, [[21.2, -9.6], [23.4, -9.6], [22.6, -11.6]], PC.blkL, OUT, 0.9);
    },
    nambu14(ctx, sl) {
      poly(ctx, [[-8, -1], [3.4, -1], [1.6, 16.5], [-9.8, 16.5]], PC.grip, OUT, 1.4);   // 向后倾斜的握把
      gripLines(ctx, -7, 2, 1, 14.5, 5);
      poly(ctx, [[-11.4, 14.6], [3, 14.6], [3, 19.6], [-11.4, 19.6]], PC.blk, OUT, 1.1);   // 弹匣底座（带突出的指托）
      rect(ctx, -6, -2.4, 24, 4.4, PC.blk, OUT, 1.3);
      // 十四年式特有：又大又圆的扳机护圈
      ctx.strokeStyle = PC.blk; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(10.5, 6.5, 7, 6.2, 0, -0.4, Math.PI + 0.55); ctx.stroke();
      line(ctx, 8.6, 1.4, 9, 5.2, PC.steel, 1.3);
      const d = sl * 6;
      poly(ctx, [[-6 - d, -9], [27 - d * 0.1, -9], [27 - d * 0.1, -2.4], [-6 - d, -2.4]], '#363c4c', OUT, 1.4);   // 细长套筒
      rect(ctx, -10.4 - d, -8.2, 4.8, 3.6, PC.blkL, OUT, 1.1);                        // 尾部圆形拉机钮
      line(ctx, 0 - d, -7.8, 24 - d * 0.1, -7.8, '#7d879c', 1);
      rect(ctx, 25, -8.2, 3, 4.6, PC.blkL, OUT, 1);
      poly(ctx, [[23.4, -9], [25.8, -9], [24.8, -11.2]], PC.blkL, OUT, 0.9);
    },
    c96(ctx, sl) {
      // 驳壳枪：长枪管 + 枪口前的盒式弹仓 + "扫帚柄"握把
      poly(ctx, [[-12, -2], [-4, -2], [-9, 17], [-17, 15]], PC.grip, OUT, 1.4);        // 向后斜的扫帚柄握把
      for (let i = 1; i < 6; i++) { const t = i / 6; line(ctx, -15 + t * 6, -1 + t * 16, -9 + t * 6, -1 + t * 16, PC.gripD, 0.9); }
      rect(ctx, -9, -8, 18, 8.4, PC.blk, OUT, 1.4);                                    // 方形机匣
      line(ctx, -7, -6.4, 7, -6.4, '#7d879c', 1);
      rect(ctx, 9, -6.6, 29 - sl * 0, 3.6, PC.blkL, OUT, 1.2);                          // 长枪管
      line(ctx, 11, -5.8, 36, -5.8, '#8d97ac', 0.9);
      rect(ctx, 5.4, 0.4, 11, 10, PC.blkL, OUT, 1.3);                                  // 扳机前的盒式弹仓
      for (let i = 0; i < 2; i++) line(ctx, 7 + i * 4, 2.4, 7 + i * 4, 8.6, PC.blk, 1);
      ctx.strokeStyle = PC.blk; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-3, 0.4); ctx.quadraticCurveTo(-2.8, 6.4, 3.8, 5); ctx.stroke();   // 护圈
      line(ctx, 0.4, 0.6, 0.8, 3.6, PC.steel, 1.2);
      const d = sl * 5;
      rect(ctx, -9 - d, -9.8, 6.4, 3, PC.blkL, OUT, 1);                                // 后坐的枪机
      ctx.strokeStyle = PC.blkL; ctx.lineWidth = 2.2;                                  // 大号圆环击锤
      ctx.beginPath(); ctx.arc(-12.4, -9.4, 3.2, 0, 6.29); ctx.stroke();
      poly(ctx, [[14, -9.4], [22, -9.4], [22, -6.6], [14, -6.6]], PC.slideD, OUT, 1);  // 梯形照门
      poly(ctx, [[34.4, -7.2], [37, -7.2], [36.2, -9.6]], PC.blkL, OUT, 0.9);
    },
    webley(ctx, sl) {
      // 韦伯利左轮：大圆筒（转轮）+ 厚重枪管 + 外露击锤
      poly(ctx, [[-10, 0], [2, 0], [1.4, 11], [3, 17], [-11, 16], [-12.4, 8]], PC.grip, OUT, 1.4);   // 鸟头握把
      gripLines(ctx, -10, 3, 0, 14, 5);
      disc(ctx, -9.6, 17.2, 1.5, PC.steel, OUT, 1);                                    // 挂绳环
      rect(ctx, -6, -9, 17, 8, PC.blk, OUT, 1.4);                                      // 机匣
      ctx.save(); ctx.translate(3.6 + 0, -4.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 6.8, 8, 0, 0, 6.29); ctx.fillStyle = PC.slide; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();   // 转轮
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.5; disc(ctx, Math.cos(a) * 3.8, Math.sin(a) * 4.6, 1.5, '#1d2230'); }
      disc(ctx, 0, 0, 1.6, PC.steel, OUT, 0.9);
      ctx.restore();
      rect(ctx, 10, -8.4, 24, 5.6, PC.blk, OUT, 1.3);                                  // 枪管（上折式，粗）
      line(ctx, 12, -7.4, 32, -7.4, '#8793aa', 1);
      rect(ctx, 9, -2.8, 6, 4.4, PC.blkL, OUT, 1.1);                                   // 折合铰链
      ctx.strokeStyle = PC.blk; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-2, 1); ctx.quadraticCurveTo(-1.6, 8, 6, 6.4); ctx.lineTo(7, 1.4); ctx.stroke();
      line(ctx, 2.4, 1.4, 2.8, 4.6, PC.steel, 1.2);
      const d = sl * 3.2;
      poly(ctx, [[-8 - d, -10], [-3 - d, -14], [-1.6 - d, -9]], PC.blkL, OUT, 1.1);   // 外露击锤
      poly(ctx, [[30, -9.4], [33, -9.4], [32, -12]], PC.blkL, OUT, 0.9);               // 准星
    },
  };

  function pistol(ctx, id, st) {
    const g = SPEC[id], fn = PISTOLS[id];
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.scale(g.k, g.k);
    fn(ctx, st.slide || 0);
    ctx.restore();
    return { xm: g.xm, my: g.my };
  }

  /* ================= 冲锋枪 ================= */
  const SM = { wood: '#a2672f', woodD: '#6a4020', woodL: '#c98e52', steel: '#5d667d', steelL: '#8a95ad', blk: '#2c3140', brass: '#d9a93b' };
  function woodStock(ctx, pts) { poly(ctx, pts, SM.wood, OUT, 1.5); }
  function drum(ctx, cx, cy, r, ribs) {              // 弹鼓
    disc(ctx, cx, cy, r, SM.blk, OUT, 1.5);
    disc(ctx, cx, cy, r * 0.62, SM.steel, OUT, 1);
    disc(ctx, cx, cy, r * 0.22, SM.brass, OUT, 0.9);
    for (let i = 0; i < ribs; i++) {
      const a = i * (6.2832 / ribs);
      line(ctx, cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66, cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94, SM.steelL, 1.1);
    }
  }
  function guard(ctx, x, y, w, h) {                   // 扳机护圈 + 扳机
    ctx.strokeStyle = SM.blk; ctx.lineWidth = 1.9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 1, y + h, x + w, y + h * 0.7); ctx.lineTo(x + w + 1, y); ctx.stroke();
    line(ctx, x + w * 0.4, y - 0.4, x + w * 0.45, y + h * 0.5, SM.steelL, 1.3);
  }
  const SMGS = {
    thompson(ctx, sl) {
      woodStock(ctx, [[-26, -6.4], [-12, -8], [-3, -4.6], [4, -4.6], [4, 2.4], [-4, 4.2], [-12, 7], [-26, 5.8]]);   // 木枪托
      rect(ctx, -27.4, -6.8, 3.2, 13, SM.steel, OUT, 1.1);
      poly(ctx, [[-3.6, 0.4], [5.2, 0.4], [3.6, 13], [-4.8, 13]], SM.wood, OUT, 1.3);                               // 手枪握把
      rect(ctx, -3, -8.8, 30, 9.2, SM.blk, OUT, 1.4);                                                               // 机匣
      line(ctx, -1, -7, 25, -7, '#8c96ae', 1);
      rect(ctx, 24, -7.6, 20, 6, SM.steel, OUT, 1.3);                                                               // 带散热片的枪管
      for (let i = 0; i < 6; i++) line(ctx, 26 + i * 3.2, -7.4, 26 + i * 3.2, -2, SM.blk, 1.4);
      rect(ctx, 43.6, -8.2, 10.6, 7, SM.blk, OUT, 1.3);                                                             // 补偿器
      for (let i = 0; i < 3; i++) line(ctx, 45.6 + i * 2.8, -7.6, 45.6 + i * 2.8, -2.6, SM.steelL, 1);
      poly(ctx, [[14, 0.4], [32, 0.4], [32, 4.6], [14, 4.6]], SM.wood, OUT, 1.3);                                   // 护木
      poly(ctx, [[20, 4.6], [26, 4.6], [25.4, 14], [20.6, 14]], SM.wood, OUT, 1.3);                                 // 垂直前握把
      rect(ctx, 8, 0.4, 8, 3.2, SM.blk, OUT, 1);
      drum(ctx, 12, 10.5, 9, 10);                                                                                   // 50 发弹鼓
      disc(ctx, 14 - sl * 6, -10.2, 2, SM.steelL, OUT, 1);                                                          // 拉机柄
      poly(ctx, [[20, -9], [27, -9], [26, -13], [21, -13]], SM.steel, OUT, 1);                                      // 照门
      poly(ctx, [[49, -8.4], [52, -8.4], [51, -11.4]], SM.steelL, OUT, 0.9);
      guard(ctx, 4.8, 0.6, 7, 5.6);
    },
    ppsh(ctx, sl) {
      woodStock(ctx, [[-26, -7], [-12, -8.6], [-3, -5], [8, -4.6], [8, 3], [-4, 5], [-12, 7.6], [-26, 6.4]]);        // 全木托
      rect(ctx, -27.4, -7.4, 3.2, 14, SM.steel, OUT, 1.1);
      poly(ctx, [[8, 0.6], [24, 0.6], [24, 5.2], [8, 5.2]], SM.wood, OUT, 1.3);                                      // 前延的木护托
      rect(ctx, -2, -8.4, 26, 8.6, SM.steel, OUT, 1.4);                                                              // 机匣
      line(ctx, 0, -6.6, 22, -6.6, '#a3adc4', 1);
      rect(ctx, 20, -10, 32, 10, '#6a7490', OUT, 1.4);                                                               // 带散热孔的枪管套
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(25 + i * 4.2, -5, 1.3, 2.6, 0, 0, 6.29); ctx.fillStyle = '#1d2230'; ctx.fill(); }
      poly(ctx, [[50, -10], [58, -10], [58, -3.4], [52, 0], [50, 0]], SM.blk, OUT, 1.3);                            // 斜口制退器
      line(ctx, 54, -9, 54, -4, SM.steelL, 1);
      drum(ctx, 14, 10.8, 9.6, 12);                                                                                  // 71 发弹鼓
      rect(ctx, 10, 0.6, 8, 3, SM.blk, OUT, 1);
      poly(ctx, [[24, -10], [29, -10], [28, -15], [25, -15]], SM.steelL, OUT, 1);                                   // 翻转照门
      disc(ctx, 6 - sl * 6, -9.8, 1.8, SM.steelL, OUT, 1);
      guard(ctx, 4, 0.4, 7, 6);
      poly(ctx, [[54, -10], [57, -10], [56, -13]], SM.steelL, OUT, 0.9);
    },
    mp28(ctx, sl) {
      woodStock(ctx, [[-26, -6], [-12, -8], [-2, -4.4], [12, -4.4], [12, 3.6], [-4, 5.2], [-12, 8], [-26, 7]]);      // 长木托（连到握把）
      rect(ctx, -27.4, -6.4, 3.2, 13.6, SM.steel, OUT, 1.1);
      for (let i = 0; i < 5; i++) line(ctx, -10 + i * 3.2, 1.6, -9 + i * 3.2, 4.4, SM.woodD, 0.9);
      rect(ctx, 0, -8.6, 26, 8.4, SM.steel, OUT, 1.4);                                                               // 机匣
      line(ctx, 2, -6.8, 24, -6.8, '#a3adc4', 1);
      rect(ctx, 15, -10, 34, 9.8, '#6a7490', OUT, 1.4);                                                              // 开长槽的枪管套
      for (let i = 0; i < 5; i++) { rect(ctx, 18 + i * 6.2, -8.2, 4.2, 2.2, '#1d2230', null); rect(ctx, 18 + i * 6.2, -4.6, 4.2, 2.2, '#1d2230', null); }
      // 左侧弹匣（正对镜头的"端面"：直弹匣从机匣侧面伸出）
      poly(ctx, [[5, 0], [22, 0], [24, 8], [7, 8]], SM.blk, OUT, 1.4);
      line(ctx, 8, 3, 21, 3, SM.steelL, 1); line(ctx, 8.6, 5.6, 22, 5.6, SM.steelL, 1);
      disc(ctx, 14, -11, 1.6, SM.steelL, OUT, 0.9);
      poly(ctx, [[22, -10], [28, -10], [27, -14], [23, -14]], SM.steelL, OUT, 1);
      poly(ctx, [[45, -10], [48, -10], [47, -13]], SM.steelL, OUT, 0.9);
      line(ctx, 8 - sl * 6, -11.4, 12 - sl * 6, -11.4, SM.steelL, 1.6);
      guard(ctx, 4, 1, 7, 6.4);
    },
    sten(ctx, sl) {
      // 骨架枪托：金属枪托板 + 两根钢条
      rect(ctx, -27, -8.6, 3.2, 15.6, SM.steel, OUT, 1.1);
      line(ctx, -24, -6.4, -6, -4.4, SM.steel, 2.4); line(ctx, -24, 4.4, -8, 3, SM.steel, 2.4); line(ctx, -15, -5.6, -15, 3.6, SM.steel, 1.8);
      rect(ctx, -7, -7.4, 38, 7.2, '#4f586e', OUT, 1.4);                                                             // 管状机匣
      line(ctx, -5, -5.8, 29, -5.8, '#9aa5bd', 1);
      rect(ctx, 6, -6.6, 8, 2.6, '#1d2230', null);                                                                   // 抛壳口
      line(ctx, 12 - sl * 7, -9, 17 - sl * 7, -9, SM.steelL, 2);                                                     // 拉机柄
      rect(ctx, 30, -7.6, 22, 6.4, '#6a7490', OUT, 1.3);                                                             // 带孔的枪管套
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(34 + i * 4, -4.4, 1.3, 0, 6.29); ctx.fillStyle = '#1d2230'; ctx.fill(); }
      poly(ctx, [[2, 0], [9, 0], [8, 9], [3, 9]], SM.blk, OUT, 1.3);                                                 // 小握把
      // 左侧弹匣（水平伸出）
      poly(ctx, [[10, 0], [28, 0], [29, 7], [11, 7]], SM.blk, OUT, 1.4);
      line(ctx, 12, 3.2, 27, 3.2, SM.steelL, 1);
      poly(ctx, [[46, -7.8], [50, -7.8], [49, -11.2]], SM.steelL, OUT, 0.9);
      poly(ctx, [[22, -7.4], [28, -7.4], [27, -11], [23, -11]], SM.steelL, OUT, 1);
      guard(ctx, 6, 0.6, 7.6, 5.6);
    },
  };
  function smg(ctx, id, st) {
    const g = SPEC[id];
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    SMGS[id](ctx, st.slide || 0);
    ctx.restore();
    return { xm: g.xm, my: g.my };
  }

  /* ================= 统一入口 + 静态贴图缓存 ================= */
  /* 枪处于"静止"状态（没有拉栓/后坐动画）时，直接贴预渲染的位图，省掉几十条路径绘制 */
  const _sprite = {};
  function staticSprite(id) {
    let sp = _sprite[id];
    if (sp) return sp;
    const g = SPEC[id], S = 2;
    const x0 = Math.floor(g.butt - 12), x1 = Math.ceil(g.xm + (g.ext || 0) + 16);
    const y0 = -36, y1 = 36;
    const cv = document.createElement('canvas');
    cv.width = (x1 - x0) * S; cv.height = (y1 - y0) * S;
    const cx = cv.getContext('2d');
    cx.scale(S, S); cx.translate(-x0, -y0);
    drawRaw(cx, id, {});
    sp = _sprite[id] = { cv, x0, y0, w: x1 - x0, h: y1 - y0 };
    return sp;
  }
  function drawRaw(ctx, id, st) {
    const g = SPEC[id] || SPEC.zhongzheng;
    if (g.type === 'pistol') return pistol(ctx, id, st);
    if (g.type === 'smg') return smg(ctx, id, st);
    return rifle(ctx, id, st);
  }
  function gun(ctx, id, st) {
    st = st || {};
    const g = SPEC[id] || SPEC.zhongzheng;
    if (!(st.open || st.back || st.slide)) {
      try {
        const sp = staticSprite(id);
        ctx.drawImage(sp.cv, sp.x0, sp.y0, sp.w, sp.h);
        return { xm: g.xm, my: g.my };
      } catch (e) { /* 离屏画布不可用时回退到矢量绘制 */ }
    }
    return drawRaw(ctx, id, st);
  }

  /* 枪口火光 */
  function flash(ctx, x, y, s, a) {
    ctx.save();
    ctx.translate(x, y); ctx.globalAlpha = a == null ? 1 : a;
    ctx.shadowColor = '#ffb340'; ctx.shadowBlur = 16;
    const spikes = 9;
    for (let layer = 0; layer < 2; layer++) {
      const R = (layer ? 0.55 : 1) * 24 * s;
      ctx.fillStyle = layer ? '#ffffff' : '#ffd25a';
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const ang = (i / (spikes * 2)) * Math.PI * 2;
        const r = i % 2 ? R * 0.38 : R * (0.8 + 0.2 * ((i * 7) % 3) / 2);
        const px = Math.cos(ang) * r + (layer ? 0 : R * 0.35), py = Math.sin(ang) * r * 0.75;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /* ================= 军帽 / 钢盔 ================= */
  /* 头部中心 (0,0)，半径 15；f=1 面朝 +x。所有形状按"朝右"绘制，再用 scale(f,1) 镜像 */
  const HELMS = {
    /* 国军 M35 德式钢盔：圆顶 + 前檐 + 向后下方展开的护颈裙边 + 左侧青天白日 */
    m35(ctx) {
      ctx.beginPath();
      ctx.moveTo(19.5, -1.2);                                  // 前檐尖
      ctx.quadraticCurveTo(18.5, -5, 15.8, -7.8);
      ctx.quadraticCurveTo(14, -17.5, 3, -20.8);                // 额头 → 盔顶
      ctx.quadraticCurveTo(-13, -23.5, -19.6, -8.5);            // 盔顶 → 后脑
      ctx.quadraticCurveTo(-23.2, 0.5, -21.6, 8.6);             // 护颈裙边向后下方外翻
      ctx.quadraticCurveTo(-12, 10.2, -3, 6.2);                 // 下沿：从颈后爬升到耳侧
      ctx.quadraticCurveTo(8, 2.4, 13.5, 0.6);                  // 下沿：耳侧 → 前檐
      ctx.closePath();
      ctx.fillStyle = '#5f6e58'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
      // 盔顶高光
      ctx.strokeStyle = '#8fa387'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-10, -19.4); ctx.quadraticCurveTo(1, -21.4, 9, -17); ctx.stroke();
      // 卷边（下沿加深）
      ctx.strokeStyle = '#38442f'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-21.4, 8.4); ctx.quadraticCurveTo(-12, 10, -3, 6); ctx.quadraticCurveTo(8, 2.2, 13.5, 0.4); ctx.stroke();
      // 前檐下沿
      ctx.strokeStyle = '#38442f'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(14.2, -7.4); ctx.lineTo(19.2, -1.4); ctx.stroke();
      disc(ctx, -4.5, -8.2, 1.7, '#2f3a2d', OUT, 0.8);          // 通风铆钉
      sunBadge(ctx, 4.5, -9, 4.8);                               // 青天白日（左侧）
    },
    /* M1 美式钢盔（远征军）：半球盔体 + 窄檐 + 网格 + 帽带 */
    m1(ctx) {
      ctx.beginPath();
      ctx.moveTo(-19.5, -1.5);
      ctx.quadraticCurveTo(-20, -19, -2, -21.5);
      ctx.quadraticCurveTo(17, -21.5, 18.5, -4);
      ctx.lineTo(22, -1.4);
      ctx.quadraticCurveTo(1, 3.4, -19.5, -1.5);
      ctx.closePath();
      ctx.fillStyle = '#617040'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
      // 伪装网纹
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(30,40,20,.55)'; ctx.lineWidth = 0.9;
      for (let i = -24; i <= 24; i += 5) {
        ctx.beginPath(); ctx.moveTo(i, -26); ctx.lineTo(i + 14, 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i + 14, -26); ctx.lineTo(i, 4); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#8fa066'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-10, -19); ctx.quadraticCurveTo(2, -21, 10, -17); ctx.stroke();
      ctx.strokeStyle = '#3a4524'; ctx.lineWidth = 2.6;                               // 钢盔卷边
      ctx.beginPath(); ctx.moveTo(-19.5, -1.6); ctx.quadraticCurveTo(1, 3.4, 21.5, -1.5); ctx.stroke();
      // 帽带（从盔沿绕过下巴）
      ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-1, 2); ctx.quadraticCurveTo(2, 12, 8, 14); ctx.stroke();
      sunBadge(ctx, 9, -11, 3.8);
    },
    /* 英式布罗迪钢盔：浅圆顶 + 极宽平檐（"汤碗帽"） */
    brodie(ctx) {
      // 宽檐
      ctx.beginPath(); ctx.ellipse(0, -3, 25, 4.8, 0, 0, 6.2832);
      ctx.fillStyle = '#6d6c46'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
      // 盔顶
      ctx.beginPath();
      ctx.moveTo(-13.5, -4);
      ctx.quadraticCurveTo(-13, -17.5, 0, -17.5);
      ctx.quadraticCurveTo(13, -17.5, 13.5, -4);
      ctx.quadraticCurveTo(0, -1.6, -13.5, -4);
      ctx.closePath();
      ctx.fillStyle = '#82805a'; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#a8a67a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-8, -14.5); ctx.quadraticCurveTo(0, -17, 7, -14); ctx.stroke();
      disc(ctx, 0, -17.2, 1.6, '#4c4b30', OUT, 0.8);                                  // 顶部铆钉
      ctx.strokeStyle = '#4c4b30'; ctx.lineWidth = 1.6;                               // 檐内沿线
      ctx.beginPath(); ctx.ellipse(0, -3.2, 21, 3.2, 0, 0.1, Math.PI - 0.1); ctx.stroke();
      sunBadge(ctx, 7, -9.8, 3.6);
    },
    /* 法式阿德里安钢盔：中央脊冠 + 前后檐 */
    adrian(ctx) {
      // 后檐
      poly(ctx, [[-16, -4.5], [-23.5, -0.8], [-15, 0.2]], '#6a7556', OUT, 1.5);
      // 盔体
      ctx.beginPath();
      ctx.moveTo(-17.5, -1.2);
      ctx.quadraticCurveTo(-18.5, -19, -1, -21);
      ctx.quadraticCurveTo(17, -20.5, 17.5, -4.6);
      ctx.lineTo(17.5, -1.2);
      ctx.quadraticCurveTo(0, 2.4, -17.5, -1.2);
      ctx.closePath();
      ctx.fillStyle = '#7a8760'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
      // 前檐（略下垂）
      poly(ctx, [[12, -5.6], [24, -2.8], [23, -0.6], [12, -1.2]], '#6a7556', OUT, 1.5);
      // 中央脊冠（前后贯通）
      ctx.strokeStyle = OUT; ctx.lineWidth = 5.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(11, -18.2); ctx.quadraticCurveTo(-1, -25, -12.5, -17.5); ctx.stroke();
      ctx.strokeStyle = '#4f5a3d'; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(11, -18.2); ctx.quadraticCurveTo(-1, -25, -12.5, -17.5); ctx.stroke();
      ctx.strokeStyle = '#a2b284'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(8, -20.2); ctx.quadraticCurveTo(-1, -23.6, -8, -19.6); ctx.stroke();
      sunBadge(ctx, 8.5, -10.5, 4);
    },
    /* 国军军便帽：灰蓝软帽 + 短帽檐 + 青天白日帽徽 */
    kmtcap(ctx) {
      ctx.beginPath();
      ctx.moveTo(-16.5, -2);
      ctx.quadraticCurveTo(-17.5, -20, 0, -20.5);
      ctx.quadraticCurveTo(17.5, -20, 16.5, -2);
      ctx.closePath();
      ctx.fillStyle = '#8c98a3'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.strokeStyle = '#b6c0ca'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-9, -17.5); ctx.quadraticCurveTo(1, -19.5, 9, -15.5); ctx.stroke();
      // 帽围
      rect(ctx, -16.8, -6.6, 33.6, 5.4, '#6a7580', OUT, 1.5);
      // 帽檐
      poly(ctx, [[13, -5.4], [25, -3.6], [24, -0.8], [13, -1.2]], '#505a64', OUT, 1.5);
      sunBadge(ctx, 8.5, -12.5, 4.2);
    },
    /* 八路军灰布军帽：圆顶直筒 + 帽围 + 两粒纽扣 + 红星 */
    bajun(ctx) {
      ctx.beginPath();
      ctx.moveTo(-16.5, -1.5);
      ctx.lineTo(-16.5, -14);
      ctx.quadraticCurveTo(-16, -22, -4, -22);
      ctx.lineTo(4, -22);
      ctx.quadraticCurveTo(16, -22, 16.5, -14);
      ctx.lineTo(16.5, -1.5);
      ctx.closePath();
      ctx.fillStyle = '#8e9190'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.strokeStyle = '#b9bcbb'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-11, -19.5); ctx.lineTo(8, -19.6); ctx.stroke();
      rect(ctx, -16.8, -7.2, 33.6, 5.6, '#6d706f', OUT, 1.5);               // 帽围
      poly(ctx, [[13, -5.6], [24.5, -3.8], [23.5, -0.8], [13, -1.2]], '#575a59', OUT, 1.5);
      disc(ctx, 2, -4.4, 1.7, '#d7d9d6', OUT, 0.8);                           // 两粒纽扣
      disc(ctx, 8.4, -4.4, 1.7, '#d7d9d6', OUT, 0.8);
      star5(ctx, 8.5, -13.2, 4.8, '#e0261f');                                 // 红星
    },
    /* 红军八角帽：八角平顶 + 红星 + 后垂帽耳 */
    bajiao(ctx) {
      // 后帽耳
      poly(ctx, [[-16, -5], [-21, 1], [-19, 7], [-13.5, 5], [-13.5, -3]], '#6b7d8a', OUT, 1.4);
      // 帽身（八角：顶部切角）
      poly(ctx, [[-16.5, -1.4], [-17, -10.5], [-11.5, -18], [11.5, -18], [17, -10.5], [16.5, -1.4]], '#7d909d', OUT, 1.8);
      // 顶面（略俯视的八边形）
      ctx.beginPath(); ctx.ellipse(0, -18, 11.5, 3, 0, 0, 6.2832);
      ctx.fillStyle = '#9db0bd'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
      // 帽沿卷边与棱线
      line(ctx, -16.8, -2.4, 16.8, -2.4, '#566877', 2.6);
      line(ctx, -5, -15.2, -5, -3.6, 'rgba(40,55,68,.35)', 1.2);
      line(ctx, 6, -15.2, 6, -3.6, 'rgba(40,55,68,.35)', 1.2);
      star5(ctx, 8.6, -10, 5.2, '#e0261f');
    },
    /* 抗联狗皮帽：皮毛圆顶 + 白毛翻边 + 脑后垂下的护耳 + 红星 */
    kanglian(ctx) {
      const FUR = '#efe3c8';
      // 脑后护耳（先画，被帽顶盖住上沿）
      ctx.beginPath();
      ctx.moveTo(-16, -4); ctx.lineTo(-16.5, 6); ctx.quadraticCurveTo(-15, 12, -9.5, 12);
      ctx.quadraticCurveTo(-4, 12, -3.5, 5); ctx.lineTo(-3.5, -4); ctx.closePath();
      ctx.fillStyle = '#6a4d2e'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.stroke();
      rect(ctx, -16.2, 8.8, 12.4, 3.6, FUR, OUT, 1.2);
      // 帽顶
      ctx.beginPath();
      ctx.moveTo(-17.5, -3);
      ctx.quadraticCurveTo(-19.5, -21.5, 0, -22);
      ctx.quadraticCurveTo(19.5, -21.5, 17.5, -3);
      ctx.closePath();
      ctx.fillStyle = '#8a6a44'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.strokeStyle = '#ad8e63'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-10, -19); ctx.quadraticCurveTo(1, -21, 9, -17); ctx.stroke();
      // 白毛翻边：整条毛边带 + 顶端不规则毛尖（用短笔画表现毛茸茸，不再是一粒粒圆球）
      poly(ctx, [[-17.8, -7.2], [17.8, -7.2], [18.4, -1.6], [-18.4, -1.6]], FUR, OUT, 1.6);
      ctx.strokeStyle = '#cdbf9f'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      for (let i = 0; i < 11; i++) {
        const x = -16 + i * 3.2;
        ctx.beginPath(); ctx.moveTo(x, -6.2); ctx.lineTo(x + 0.8, -2.6); ctx.stroke();
      }
      star5(ctx, 9, -13, 4.4, '#e0261f');
    },
  };

  function drawHelmet(ctx, id, f, t) {
    const fn = HELMS[id];
    if (!fn) return false;
    ctx.save();
    ctx.scale(f || 1, 1);
    fn(ctx, t || 0);
    ctx.restore();
    return true;
  }

  /* ================= 图标 / 通用图标绘制 ================= */
  const _icons = {};
  function icon(kind, id) {
    const key = kind + ':' + id;
    if (_icons[key]) return _icons[key];
    let cv, cx;
    try {
      if (kind === 'weapon') {
        cv = document.createElement('canvas'); cv.width = 240; cv.height = 96;
        cx = cv.getContext('2d');
        const g = SPEC[id]; if (!g) return null;
        const ext = g.ext || 0, len = g.xm - g.butt + ext;
        const sc = Math.min(2.2, 200 / len, 64 / g.ih);
        cx.translate(120 - ((g.butt + g.xm + ext) / 2) * sc, 48 - g.cy * sc);
        cx.scale(sc, sc);
        drawRaw(cx, id, {});
      } else {
        cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
        cx = cv.getContext('2d');
        cx.translate(60, 86); cx.scale(2.5, 2.5);
        // 头（火柴人头 + 脖子一小段，让军帽的位置一目了然）
        cx.strokeStyle = '#19b5e6'; cx.lineWidth = 9; cx.lineCap = 'round';
        cx.beginPath(); cx.moveTo(0, 15); cx.lineTo(-2, 30); cx.stroke();
        disc(cx, 0, 0, 15, '#19b5e6');
        if (!drawHelmet(cx, id, 1, 0)) return null;
      }
      _icons[key] = cv.toDataURL('image/png');
    } catch (e) { return null; }
    return _icons[key];
  }
  function iconHTML(kind, item) {
    if (item.custom) {
      const url = icon(kind, item.id);
      if (url) return '<img class="pick-icon-img ' + kind + '" src="' + url + '" alt="">';
    }
    return item.icon;
  }

  /* 掉落气泡 / HUD 小招圆里画武器图标 */
  function drawWeaponIcon(ctx, w, x, y, size) {
    const g = w.gun && SPEC[w.id];
    if (g) {
      const ext = g.ext || 0, len = g.xm - g.butt + ext;
      const sc = Math.min(size * 2.1 / len, size * 1.5 / g.ih);
      let sp;
      try { sp = staticSprite(w.id); } catch (e) { sp = null; }
      ctx.save();
      ctx.translate(x - ((g.butt + g.xm + ext) / 2) * sc, y - g.cy * sc);
      ctx.scale(sc, sc);
      if (sp) ctx.drawImage(sp.cv, sp.x0, sp.y0, sp.w, sp.h); else drawRaw(ctx, w.id, {});
      ctx.restore();
    } else {
      ctx.save();
      ctx.font = size + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(w.icon, x, y);
      ctx.restore();
    }
  }

  return { SPEC, BUTT, rifle, gun, drawRaw, flash, boltState, handleGeom, drawHelmet, icon, iconHTML, drawWeaponIcon, disc, line, smooth };
})();
