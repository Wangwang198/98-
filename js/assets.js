/* 低配置优化：优先加载背景，特效分批后台加载，避免旧手机/Win7 首屏卡死。 */
window.SD = window.SD || {};
SD.W = 1280; SD.H = 720; SD.GROUND = 622;
SD.ASSETS = {
  bg: {
    changban: 'assets/bg/bg_changban.jpg', chibi: 'assets/bg/bg_chibi.jpg',
    hulao: 'assets/bg/bg_hulao.jpg', wuzhang: 'assets/bg/bg_wuzhang.jpg',
    pixel: 'assets/bg/bg_pixel.jpg', neon: 'assets/bg/bg_neon.jpg',
    volcano: 'assets/bg/bg_volcano.jpg', sakura: 'assets/bg/bg_sakura.jpg',
    tiexue: 'assets/bg/bg_tiexue.jpg',
    changcheng: 'assets/bg/bg_changcheng_sisheng.png',
    wobunengdaoxia: 'assets/bg/bg_wobunengdaoxia.png',
    lugouqiao: 'assets/bg/bg_lugouqiao_zujing.png'
  }, music: {}, sfx: {},
  fx: {
    slash_cyan:{dir:'assets/fx/slash_cyan',frames:['1.png','2.png','3.png','4.png','5.png']},
    slash_blue:{dir:'assets/fx/slash_blue',frames:['1.png','2.png','3.png','4.png','5.png']},
    slash_purple:{dir:'assets/fx/slash_purple',frames:['1.png','2.png','3.png','4.png','5.png']},
    slash_gold:{dir:'assets/fx/slash_gold',frames:['1.png','2.png','3.png','4.png','5.png']},
    slash_green:{dir:'assets/fx/slash_green',frames:['1.png','2.png','3.png','4.png','5.png']},
    fire:{dir:'assets/fx/fire',frames:['000.png','001.png','002.png','003.png','004.png']},
    thunder:{dir:'assets/fx/thunder',frames:['000.png','001.png','002.png','003.png','004.png']},
    arrow:{dir:'assets/fx/arrow',frames:['000.png','001.png','002.png']}
  }
};
SD.images = {}; SD.fxSeq = {}; SD.buffers = {};
SD._bgLoading = {};
SD._bgPromises = {};
SD._bgFailed = {};
SD.loadBg = function(key) {
  if (SD.images[key]) return Promise.resolve(SD.images[key]);
  if (SD._bgPromises[key]) return SD._bgPromises[key];
  if (SD._bgFailed[key]) return Promise.resolve(null);
  var url = SD.ASSETS.bg[key];
  if (!url) return Promise.resolve(null);
  SD._bgLoading[key] = true;
  SD._bgPromises[key] = new Promise(function(resolve) {
    var img = new Image(), settled = false;
    var timeout = setTimeout(function() {
      if (settled) return;
      settled = true;
      SD._bgFailed[key] = true;
      delete SD._bgLoading[key];
      delete SD._bgPromises[key];
      resolve(null);
    }, 7000);
    img.onload = function() {
      SD.images[key] = img;
      delete SD._bgFailed[key];
      delete SD._bgLoading[key];
      clearTimeout(timeout);
      if (!settled) { settled = true; resolve(img); }
      delete SD._bgPromises[key];
    };
    img.onerror = function() {
      SD._bgFailed[key] = true;
      delete SD._bgLoading[key];
      clearTimeout(timeout);
      if (!settled) { settled = true; resolve(null); }
      delete SD._bgPromises[key];
    };
    img.src = url;
  });
  return SD._bgPromises[key];
};
SD.preload = function(onProgress) {
  var keys = Object.keys(SD.ASSETS.bg);
  var firstKey = keys.length ? keys[0] : null;
  // 启动阶段只加载默认地图，避免启动时一次下载全部背景图抢占慢网带宽。
  var first = firstKey ? SD.loadBg(firstKey) : Promise.resolve(null);
  // 特效图延后、串行加载，不阻塞主菜单；其余地图由选择界面按需加载。
  setTimeout(function() {
    var jobs = [];
    Object.keys(SD.ASSETS.fx).forEach(function(name) {
      var def = SD.ASSETS.fx[name];
      SD.fxSeq[name] = new Array(def.frames.length);
      def.frames.forEach(function(fn, i) { jobs.push({ name: name, def: def, fn: fn, i: i }); });
    });
    var i = 0;
    function loadNext() {
      if (i >= jobs.length) return;
      var j = jobs[i++], img = new Image();
      img.onload = function() { SD.fxSeq[j.name][j.i] = img; setTimeout(loadNext, 55); };
      img.onerror = function() { setTimeout(loadNext, 55); };
      img.src = j.def.dir + '/' + j.fn;
    }
    loadNext();
  }, 1400);
  // 慢速连接最多等待 1.2 秒；即使图片网络加载较慢也允许先进入菜单。
  return Promise.race([first, new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 1200); })])
    .then(function(result) { if (onProgress) onProgress(1); return result; });
};
