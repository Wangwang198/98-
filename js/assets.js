/* 低配置优化：优先加载背景，特效分批后台加载，避免旧手机/Win7 首屏卡死。 */
window.SD = window.SD || {};
SD.W = 1280; SD.H = 720; SD.GROUND = 622;
SD.ASSETS = {
  bg: {
    changban: 'assets/bg/bg_changban.jpg', chibi: 'assets/bg/bg_chibi.jpg',
    hulao: 'assets/bg/bg_hulao.jpg', wuzhang: 'assets/bg/bg_wuzhang.jpg',
    pixel: 'assets/bg/bg_pixel.jpg', neon: 'assets/bg/bg_neon.jpg',
    volcano: 'assets/bg/bg_volcano.jpg', sakura: 'assets/bg/bg_sakura.jpg'
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
SD.loadBg = function(key) {
  if (SD.images[key] || SD._bgLoading[key]) return;
  var url = SD.ASSETS.bg[key]; if (!url) return;
  SD._bgLoading[key] = true;
  var img = new Image();
  img.onload = function(){ SD.images[key]=img; delete SD._bgLoading[key]; };
  img.onerror = function(){ delete SD._bgLoading[key]; };
  img.src = url;
};
SD.preload = function(onProgress) {
  var keys = Object.keys(SD.ASSETS.bg), total = keys.length, done = 0;
  // 只优先载入首个背景；其他背景在选中/绘制时按需加载。
  function firstBg(){ return new Promise(function(resolve){
    var key=keys[0], img=new Image(), finished=false;
    function end(){ if(finished)return; finished=true; done++; if(onProgress)onProgress(done/Math.max(1,total)); resolve(); }
    img.onload=function(){SD.images[key]=img;end();}; img.onerror=end; img.src=SD.ASSETS.bg[key];
    setTimeout(end,2500);
  }); }
  return firstBg().then(function(){
    // 其他背景串行预热，限制并发，防止老设备内存和网络被一次占满。
    var chain=Promise.resolve();
    keys.slice(1).forEach(function(key){ chain=chain.then(function(){return new Promise(function(resolve){
      var img=new Image(), ended=false; function end(){if(ended)return;ended=true;done++;if(onProgress)onProgress(done/Math.max(1,total));resolve();}
      img.onload=function(){SD.images[key]=img;end();}; img.onerror=end; img.src=SD.ASSETS.bg[key]; setTimeout(end,1800);
    });}); });
    // 游戏启动不等待特效，特效按顺序低优先级加载。
    setTimeout(function(){
      var jobs=[]; Object.keys(SD.ASSETS.fx).forEach(function(name){var def=SD.ASSETS.fx[name];SD.fxSeq[name]=new Array(def.frames.length);def.frames.forEach(function(fn,i){jobs.push({name:name,def:def,fn:fn,i:i});});});
      var i=0; function loadNext(){ if(i>=jobs.length)return; var j=jobs[i++], img=new Image(); img.onload=function(){SD.fxSeq[j.name][j.i]=img;setTimeout(loadNext,15);}; img.onerror=function(){setTimeout(loadNext,15);}; img.src=j.def.dir+'/'+j.fn; }
      loadNext();
    }, 700);
    // 不阻塞启动：背景按需加载，慢网环境最多等 3 秒。
    return Promise.race([chain,new Promise(function(r){setTimeout(r,3000);})]);
  });
};
