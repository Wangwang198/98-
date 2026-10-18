/* ===== main.js 入口：场景状态机 + 主循环（固定步长） + 自适应缩放 ===== */
window.SD = window.SD || {};
SD.state = 'boot';

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let scale = 1, ox = 0, oy = 0;

  function resize() {
    const dpr = Math.min((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 1 : 1.25, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    scale = Math.min(canvas.width / SD.W, canvas.height / SD.H);
    ox = (canvas.width - SD.W * scale) / 2;
    oy = (canvas.height - SD.H * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // 菜单待机背景（canvas 绘制）
  function drawIdleBg(t) {
    const g = ctx.createLinearGradient(0, 0, 0, SD.H);
    g.addColorStop(0, '#16204a'); g.addColorStop(1, '#101736');
    ctx.fillStyle = g; ctx.fillRect(0, 0, SD.W, SD.H);
    // 飘动火星
    ctx.fillStyle = 'rgba(255,170,60,.5)';
    for (let i = 0; i < 24; i++) {
      const x = (i * 173 + t * 30 * (1 + i % 3)) % SD.W;
      const y = SD.H - ((t * 40 * (1 + i % 2) + i * 97) % SD.H);
      ctx.globalAlpha = 0.2 + 0.3 * Math.sin(t * 3 + i);
      ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, 6.29); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let last = 0, acc = 0;
  const STEP = 1 / 60;

  function loop(ts) {
    requestAnimationFrame(loop);
    const now = ts / 1000;
    let dt = now - last; last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;

    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.imageSmoothingEnabled = true;

    if (SD.state === 'battle' && SD.game) {
      // 固定步长更新，保证不同帧率下手感一致
      let n = 0;
      while (acc >= STEP && n < 4) { SD.game.update(STEP); acc -= STEP; n++; }
      SD.game.draw(ctx);
    } else {
      acc = 0;
      drawIdleBg(now);
      if (SD.state === 'lobby') SD.UI.drawPreviews(now);
    }
  }

  // 启动：预加载 → 菜单
  window.addEventListener('DOMContentLoaded', () => {
    SD.UI.init();
    const fill = document.getElementById('bootFill');
    const txt = document.getElementById('bootText');
    SD.preload(p => {
      fill.style.width = (p * 100).toFixed(0) + '%';
    }).then(() => {
      txt.textContent = '完成！';
      setTimeout(() => {
        SD.state = 'menu';
        SD.UI.show('menu');
        SD.AudioMan.music('menu');
      }, 250);
    });
    requestAnimationFrame(loop);
  });

  // 首次交互解锁音频
  window.addEventListener('pointerdown', () => SD.AudioMan.ensure(), { once: true });
  window.addEventListener('keydown', () => SD.AudioMan.ensure(), { once: true });
})();
