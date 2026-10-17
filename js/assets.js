/* ===== assets.js 资源清单与预加载 ===== */
window.SD = window.SD || {};

SD.W = 1280; SD.H = 720; SD.GROUND = 622;

SD.ASSETS = {
  // 关卡背景（AI 生成；加载失败自动回退程序化背景）
  bg: {
    changban: 'assets/bg/bg_changban.jpg',
    chibi:    'assets/bg/bg_chibi.jpg',
    hulao:    'assets/bg/bg_hulao.jpg',
    wuzhang:  'assets/bg/bg_wuzhang.jpg',
    pixel:    'assets/bg/bg_pixel.jpg',
    neon:     'assets/bg/bg_neon.jpg',
    volcano:  'assets/bg/bg_volcano.jpg',
    sakura:   'assets/bg/bg_sakura.jpg',
  },
  // 原始压缩包中的背景音乐与音效文件已移除；游戏音效由 audio.js 通过 WebAudio 合成。
  music: {},
  sfx: {},
  // Spine 特效帧序列（来自素材库）
  fx: {
    slash_cyan:   { dir: 'assets/fx/slash_cyan',   frames: ['1.png','2.png','3.png','4.png','5.png'] },
    slash_blue:   { dir: 'assets/fx/slash_blue',   frames: ['1.png','2.png','3.png','4.png','5.png'] },
    slash_purple: { dir: 'assets/fx/slash_purple', frames: ['1.png','2.png','3.png','4.png','5.png'] },
    slash_gold:   { dir: 'assets/fx/slash_gold',   frames: ['1.png','2.png','3.png','4.png','5.png'] },
    slash_green:  { dir: 'assets/fx/slash_green',  frames: ['1.png','2.png','3.png','4.png','5.png'] },
    fire:         { dir: 'assets/fx/fire',         frames: ['000.png','001.png','002.png','003.png','004.png'] },
    thunder:      { dir: 'assets/fx/thunder',      frames: ['000.png','001.png','002.png','003.png','004.png'] },
    arrow:        { dir: 'assets/fx/arrow',        frames: ['000.png','001.png','002.png'] },
  }
};

SD.images = {};   // 已加载图片
SD.fxSeq = {};    // 特效帧序列 {name:[Image,...]}
SD.buffers = {};  // 已解码音频 {name:[AudioBuffer,...]}

SD.preload = function (onProgress) {
  const jobs = [];
  let done = 0, total = 0;
  const tick = () => { done++; onProgress && onProgress(done / Math.max(1, total)); };

  // 背景图
  Object.keys(SD.ASSETS.bg).forEach(key => {
    total++;
    jobs.push(new Promise(res => {
      const img = new Image();
      img.onload = () => { SD.images[key] = img; tick(); res(); };
      img.onerror = () => { tick(); res(); };   // 失败→程序化背景
      img.src = SD.ASSETS.bg[key];
    }));
  });

  // 音效（AudioContext 解码；失败忽略，播放时用合成兜底）
  Object.keys(SD.ASSETS.sfx).forEach(name => {
    SD.buffers[name] = [];
    SD.ASSETS.sfx[name].forEach(url => {
      total++;
      jobs.push(
        SD.AudioMan.decode(url).then(buf => { if (buf) SD.buffers[name].push(buf); tick(); })
          .catch(() => { tick(); })
      );
    });
  });

  // 特效帧序列
  Object.keys(SD.ASSETS.fx).forEach(name => {
    const def = SD.ASSETS.fx[name];
    SD.fxSeq[name] = new Array(def.frames.length);
    def.frames.forEach((fn, i) => {
      total++;
      jobs.push(new Promise(res => {
        const img = new Image();
        img.onload = () => { SD.fxSeq[name][i] = img; tick(); res(); };
        img.onerror = () => { tick(); res(); };
        img.src = def.dir + '/' + fn;
      }));
    });
  });

  total += 0;
  // 全局兜底：12 秒内无论是否加载完都进入游戏（缺失资源自动降级）
  return Promise.race([
    Promise.all(jobs),
    new Promise(res => setTimeout(res, 12000)),
  ]);
};
