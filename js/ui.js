/* 十一首本地音乐播放器：音量 20%，支持拖动、折叠和切歌，适配 GitHub Pages。 */
function initLocalMusicPlayer() {
  var audio = document.getElementById('playlistAudio');
  if (!audio) return;
  var root = 'assets/music/';
  var songs = [
    { file: 'Phone Kisses - suhmeduh.mp3', name: 'Phone Kisses - suhmeduh' },
    { file: 'Daylight - Seredris.mp3', name: 'Daylight - Seredris' },
    { file: 'A Little Story - Valentin.mp3', name: 'A Little Story - Valentin' },
    { file: '24_7 - SYNTH.mp3', name: '24/7 - SYNTH' },
    { file: 'jingwei-downtuned.mp3', name: '精卫（降调） - 眠舸' },
    { file: 'mango-nektar-corn-wave.mp3', name: 'манго нектар - Corn Wave' },
    { file: 'una-mattina-ludovico-einaudi.mp3', name: 'Una Mattina - Ludovico Einaudi' },
    { file: 'lonely-day-jurrivh.mp3', name: 'Lonely Day - Jurrivh' },
    { file: 'kids-kyle-dixon-michael-stein.mp3', name: 'Kids - Kyle Dixon & Michael Stein' },
    { file: 'evening-corn-wave.mp3', name: 'evening - Corn Wave' },
    { file: 'dinosaurs-corn-wave.mp3', name: 'dinosaurs - Corn Wave' }
  ];
  var index = 0;
  var wantsPlay = false;
  var playing = false;
  var attempting = false;
  var playRequestedAt = 0;
  var track = document.getElementById('musicTrack');
  var playButton = document.getElementById('musicPlay');
  function labelPlay(isPlaying) {
    playing = isPlaying;
    if (playButton) playButton.innerHTML = isPlaying ? 'Ⅱ 暂停' : '▶ 播放';
  }
  function setTrack(tryPlay) {
    audio.pause();
    audio.src = encodeURI(root + songs[index].file);
    audio.preload = 'metadata';
    audio.volume = 0.20;
    audio.loop = false;
    try { audio.load(); } catch (ignore) {}
    if (track) track.textContent = songs[index].name;
    labelPlay(false);
    if (tryPlay) playCurrent();
  }
  function playCurrent() {
    wantsPlay = true;
    if (playing && !audio.paused) return;
    if (attempting) return;
    attempting = true;
    playRequestedAt = Date.now();
    audio.volume = 0.20;
    audio.preload = 'auto';
    var result;
    try { result = audio.play(); } catch (err) { attempting = false; labelPlay(false); return; }
    if (result && result.then) {
      result.then(function () { attempting = false; labelPlay(true); }).catch(function () { attempting = false; labelPlay(false); });
    } else {
      attempting = false;
      labelPlay(true);
    }
  }
  function next(step) {
    index = (index + step + songs.length) % songs.length;
    setTrack(wantsPlay);
  }
  document.getElementById('musicPrev').onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); next(-1); };
  document.getElementById('musicNext').onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); next(1); };
  playButton.onclick = function (e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (playing && !audio.paused) { wantsPlay = false; audio.pause(); labelPlay(false); }
    else { wantsPlay = true; playCurrent(); }
  };
  // 折叠时只显示小浮窗；点击小浮窗或加号可展开。
  var playerRoot = document.getElementById('musicPlayer');
  var dragHandle = document.getElementById('musicDragHandle');
  var collapseButton = document.getElementById('musicCollapse');
  function setCollapsed(collapsed) {
    if (!playerRoot) return;
    if (collapsed) {
      playerRoot.classList.add('is-collapsed');
      if (collapseButton) { collapseButton.innerHTML = '+'; collapseButton.title = '展开播放器'; collapseButton.setAttribute('aria-label', '展开播放器'); }
    } else {
      playerRoot.classList.remove('is-collapsed');
      if (collapseButton) { collapseButton.innerHTML = '−'; collapseButton.title = '折叠播放器'; collapseButton.setAttribute('aria-label', '折叠播放器'); }
    }
  }
  if (collapseButton) collapseButton.onclick = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    setCollapsed(!playerRoot.classList.contains('is-collapsed'));
  };
  if (playerRoot) playerRoot.onclick = function (e) {
    if (playerRoot.classList.contains('is-collapsed') &&
        (!e || !e.target || e.target.id !== 'musicCollapse')) setCollapsed(false);
  };
  // 使用 mouse/touch 事件，避免依赖较新的 Pointer Events，兼容较旧的 Win7 浏览器。
  if (dragHandle && playerRoot) {
    var dragging = false, dragStartX = 0, dragStartY = 0, playerStartX = 0, playerStartY = 0;
    function beginDrag(x, y, target) {
      if (target && (target.id === 'musicCollapse' || target.closest && target.closest('#musicCollapse'))) return;
      var rect = playerRoot.getBoundingClientRect();
      dragging = true; dragStartX = x; dragStartY = y;
      playerStartX = rect.left; playerStartY = rect.top;
      playerRoot.style.left = rect.left + 'px'; playerRoot.style.top = rect.top + 'px';
      playerRoot.style.right = 'auto'; playerRoot.style.bottom = 'auto';
    }
    function moveDrag(x, y, ev) {
      if (!dragging) return;
      var maxX = Math.max(0, window.innerWidth - playerRoot.offsetWidth);
      var maxY = Math.max(0, window.innerHeight - playerRoot.offsetHeight);
      var left = Math.max(0, Math.min(maxX, playerStartX + x - dragStartX));
      var top = Math.max(0, Math.min(maxY, playerStartY + y - dragStartY));
      playerRoot.style.left = left + 'px'; playerRoot.style.top = top + 'px';
      if (ev && ev.preventDefault) ev.preventDefault();
    }
    function endDrag() { dragging = false; }
    dragHandle.addEventListener('mousedown', function (e) {
      e = e || window.event; beginDrag(e.clientX, e.clientY, e.target);
    });
    document.addEventListener('mousemove', function (e) { if (dragging) moveDrag(e.clientX, e.clientY, e); });
    document.addEventListener('mouseup', endDrag);
    dragHandle.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      var t = e.touches[0]; beginDrag(t.clientX, t.clientY, e.target);
    });
    document.addEventListener('touchmove', function (e) {
      if (!dragging || !e.touches || !e.touches.length) return;
      var t = e.touches[0]; moveDrag(t.clientX, t.clientY, e);
    });
    document.addEventListener('touchend', endDrag);
    document.addEventListener('touchcancel', endDrag);
  }
  audio.addEventListener('ended', function () { if (wantsPlay) next(1); });
  audio.addEventListener('playing', function () { attempting = false; labelPlay(true); });
  audio.addEventListener('pause', function () { if (audio.ended) return; if (!wantsPlay) labelPlay(false); });
  audio.addEventListener('waiting', function () { if (track && wantsPlay) track.textContent = songs[index].name + '（缓冲中…）'; });
  audio.addEventListener('canplay', function () {
    if (track && track.textContent.indexOf('（缓冲中…）') >= 0) track.textContent = songs[index].name;
    // 不在 canplay 中自动反复 play；用户点击播放后由浏览器自行缓冲续播。
  });
  audio.addEventListener('stalled', function () {
    // 网络短暂中断时由浏览器继续缓冲；数据恢复后 canplay 会继续播放。
    if (track && wantsPlay) track.textContent = songs[index].name + '（缓冲中…）';
  });
  audio.addEventListener('error', function () {
    attempting = false; labelPlay(false);
    if (track) track.textContent = songs[index].name + '（加载失败，可重新播放）';
  });
  audio.src = encodeURI(root + songs[index].file);
  audio.preload = 'metadata';
  audio.volume = 0.20;
  try { audio.load(); } catch (ignore) {}
  // 不强制自动播放。用户点击“播放”后开始加载，旧设备避免启动时下载音乐导致图片/游戏卡顿。

  // 左上角 FGY 举牌贴纸：鼠标/触屏均可拖动，拖动位置限制在可视区域内。
  var creator = document.getElementById('creatorSticker');
  if (creator) {
    var stickerDragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    function stickerStart(x, y) {
      var r = creator.getBoundingClientRect();
      stickerDragging = true; sx = x; sy = y; sl = r.left; st = r.top;
      creator.style.left = r.left + 'px'; creator.style.top = r.top + 'px';
      creator.style.right = 'auto'; creator.style.bottom = 'auto';
      creator.style.cursor = 'grabbing';
    }
    function stickerMove(x, y, ev) {
      if (!stickerDragging) return;
      var maxL = Math.max(0, window.innerWidth - creator.offsetWidth);
      var maxT = Math.max(0, window.innerHeight - creator.offsetHeight);
      creator.style.left = Math.max(0, Math.min(maxL, sl + x - sx)) + 'px';
      creator.style.top = Math.max(0, Math.min(maxT, st + y - sy)) + 'px';
      if (ev && ev.preventDefault) ev.preventDefault();
    }
    function stickerEnd() { stickerDragging = false; creator.style.cursor = 'grab'; }
    creator.addEventListener('mousedown', function (e) { e = e || window.event; stickerStart(e.clientX, e.clientY); });
    document.addEventListener('mousemove', function (e) { stickerMove(e.clientX, e.clientY, e); });
    document.addEventListener('mouseup', stickerEnd);
    creator.addEventListener('touchstart', function (e) { if (e.touches && e.touches.length) { var t=e.touches[0]; stickerStart(t.clientX,t.clientY); } }, {passive:true});
    document.addEventListener('touchmove', function (e) { if (stickerDragging && e.touches && e.touches.length) { var t=e.touches[0]; stickerMove(t.clientX,t.clientY,e); } }, {passive:false});
    document.addEventListener('touchend', stickerEnd);
    document.addEventListener('touchcancel', stickerEnd);
  }
}

/* ===== ui.js 菜单 / 大厅 / 选择器 / 宝箱 / 键盘与触控输入 ===== */
window.SD = window.SD || {};

SD.coins = 0;
SD.unlocked = { weapons: ['sword', 'hammer'], helmets: ['none'] };
// 本地自由游玩模式：所有武器与头盔都直接开放，不需要金币或宝箱解锁。
SD.unlockAllEquipment = function () {
  SD.unlocked.weapons = Object.keys(SD.WEAPONS || {});
  SD.unlocked.helmets = Object.keys(SD.HELMETS || {});
};
SD.best = { wins: 0 };
SD.cfg = {
  mode: 'single', diff: 1, level: 0,
  p1: { color: 'cyan', weapon: 'sword', helmet: 'none' },
  p2: { color: 'purple', weapon: 'hammer', helmet: 'none' },
};

SD.save = function () {
  try {
    localStorage.setItem('sd_save', JSON.stringify({ coins: SD.coins, unlocked: SD.unlocked, best: SD.best, streak: SD.streak || 0 }));
  } catch (e) {}
};
SD.load = function () {
  try {
    const d = JSON.parse(localStorage.getItem('sd_save') || 'null');
    if (d) { SD.coins = d.coins || 0; SD.streak = d.streak || 0; Object.assign(SD.unlocked, d.unlocked || {}); Object.assign(SD.best, d.best || {}); }
  } catch (e) {}
};
SD.addCoins = function (n) {
  SD.coins += n; SD.save();
  document.querySelectorAll('.coin-pill').forEach(el => el.textContent = '💰 ' + SD.coins);
};

/* ---------------- 输入 ---------------- */
SD.input = {
  p1: { left: 0, right: 0, up: 0, down: 0, skillPressed: 0, superPressed: 0, _upHeld: 0 },
  p2: { left: 0, right: 0, up: 0, down: 0, skillPressed: 0, superPressed: 0, _upHeld: 0 },
};

SD.UI = {
  isTouch: false,

  init() {
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.pickerCat = 0;
    this.bindKeys();
    this.bindTouch();
    this.bindMenus();
    SD.load();
    // 覆盖旧存档里的锁定清单，保证旧用户进入游戏也立即拥有全部装备。
    SD.unlockAllEquipment();
    SD.save();
    SD.addCoins(0);
  },

  /* ---------- 键盘 ---------- */
  bindKeys() {
    const map = {
      KeyA: ['p1', 'left'], KeyD: ['p1', 'right'], KeyW: ['p1', 'up'], KeyS: ['p1', 'down'],
      ArrowLeft: ['p2', 'left'], ArrowRight: ['p2', 'right'], ArrowUp: ['p2', 'up'], ArrowDown: ['p2', 'down'],
    };
    window.addEventListener('keydown', e => {
      SD.AudioMan.ensure();
      const m = map[e.code];
      if (m) { SD.input[m[0]][m[1]] = 1; e.preventDefault(); return; }
      if (e.code === 'KeyE') SD.input.p1.skillPressed = 1;
      else if (e.code === 'KeyR') SD.input.p1.superPressed = 1;
      else if (e.code === 'KeyP' || e.code === 'Escape') SD.input._pausePressed = 1;
      else if (e.code === 'ShiftRight') { SD.input.p2.skillPressed = 1; e.preventDefault(); }
      else if (e.code === 'Enter') { SD.input.p2.superPressed = 1; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      const m = map[e.code];
      if (m) SD.input[m[0]][m[1]] = 0;
    });
  },

  /* ---------- 虚拟按键 ---------- */
  bindTouch() {
    // 无论电脑还是移动端，都显示可点击的屏幕虚拟按键。
    document.getElementById('touchUI').classList.remove('hidden');
    document.querySelectorAll('.tc-btn').forEach(btn => {
      const key = btn.dataset.k;             // 如 p1.left / p2.super
      const [p, k] = key.split('.');
      const press = e => {
        e.preventDefault(); SD.AudioMan.ensure();
        btn.classList.add('press');
        if (k === 'skill') SD.input[p].skillPressed = 1;
        else if (k === 'super') SD.input[p].superPressed = 1;
        else SD.input[p][k] = 1;
      };
      const release = e => {
        e.preventDefault();
        btn.classList.remove('press');
        if (k !== 'skill' && k !== 'super') SD.input[p][k] = 0;
      };
      // Pointer Events 新浏览器优先；旧版 Windows/浏览器使用鼠标或触屏事件兜底。
      if (window.PointerEvent) {
        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('pointerleave', release);
      } else {
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);
        btn.addEventListener('touchstart', press, false);
        btn.addEventListener('touchend', release, false);
        btn.addEventListener('touchcancel', release, false);
      }
    });
    // 双人时显示两侧；单人只显示左侧
    this.updateTouchLayout();
  },
  updateTouchLayout() {
    const p2 = document.getElementById('tcP2');
    if (p2) p2.style.display = (SD.cfg.mode === 'double') ? '' : 'none';
  },

  /* ---------- 菜单逻辑 ---------- */
  bindMenus() {
    const $ = id => document.getElementById(id);
    $('btnSingle').onclick = () => { SD.AudioMan.play('coin'); SD.cfg.mode = 'single'; this.openLobby(); };
    $('btnDouble').onclick = () => { SD.AudioMan.play('coin'); SD.cfg.mode = 'double'; this.openLobby(); };
    $('btnLobbyBack').onclick = () => this.show('menu');
    $('btnFight').onclick = () => this.startBattle();
    $('btnAgain').onclick = () => this.startBattle();
    $('btnToLobby').onclick = () => this.openLobby();
    $('btnMute').onclick = e => { const m = SD.AudioMan.toggleMute(); e.target.textContent = m ? '🔇' : '🔊'; };
    $('btnHelp').onclick = () => this.showModal('helpModal');
    var noticeClose = $('noticeClose');
    if (noticeClose) noticeClose.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); $('noticeWindow').style.display = 'none'; };
    var updateNoticeClose = $('updateNoticeClose');
    if (updateNoticeClose) updateNoticeClose.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      $('updateNotice').classList.remove('show');
      // Only suppress the next visit when the user explicitly checks “记住此选项”.
      // If unchecked, remove the preference so the notice appears again next time.
      var remember = $('updateNoticeRemember');
      try {
        if (remember && remember.checked) localStorage.setItem('sd_update_antiwar_four_maps_20261024_fillnotice2', '1');
        else localStorage.removeItem('sd_update_antiwar_four_maps_20261024_fillnotice2');
      } catch (ignore) {}
    };
    initLocalMusicPlayer();
    $('helpClose').onclick = () => this.hide('helpModal');
    $('pickerClose').onclick = () => this.hide('picker');
    $('btnChest').onclick = () => this.openChest();
    $('chestIcon').onclick = () => this.openChest();
    $('btnChestOk').onclick = () => this.hide('chestModal');

    // 装备选择按钮
    document.querySelectorAll('.pl-btn[data-pick]').forEach(b => {
      b.onclick = () => this.openPicker(b.dataset.pick, +b.dataset.p);
    });
    // AI 难度
    document.querySelectorAll('#aiDiffWrap .diff-btns button').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#aiDiffWrap .diff-btns button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); SD.cfg.diff = +b.dataset.d;
      };
    });
    // 关卡
    this.buildLevels();
  },

  show(id) {
    // 页面级切换：隐藏其他页面层
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show'));
    document.getElementById(id).classList.add('show');
    if (id === 'menu') { SD.state = 'menu'; SD.AudioMan.music('menu'); }
  },
  showModal(id) {
    // 弹窗级：叠加在当前页面上，不隐藏底层
    document.getElementById(id).classList.add('show');
  },
  hide(id) { document.getElementById(id).classList.remove('show'); },
  hideAll() { document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show')); },

  openLobby() {
    SD.state = 'lobby';
    this.show('lobby');
    document.getElementById('aiDiffWrap').style.display = SD.cfg.mode === 'single' ? '' : 'none';
    document.getElementById('p2Name').textContent = SD.cfg.mode === 'single' ? 'AI 名将' : '玩家 2';
    document.getElementById('p2KeyHint').style.display = SD.cfg.mode === 'single' ? 'none' : '';
    this.refreshLobby();
  },

  buildLevels() {
    const wrap = document.getElementById('levelSelect');
    wrap.innerHTML = '';
    SD.LEVELS.forEach((lv, i) => {
      const b = document.createElement('button');
      b.className = 'lv-btn' + (i === SD.cfg.level ? ' on' : '') + (['tiexue','changcheng','wobunengdaoxia','lugouqiao'].indexOf(lv.id) >= 0 ? ' lv-new-map' : '');
      b.textContent = lv.name;
      b.title = lv.desc;
      b.onclick = () => {
        SD.cfg.level = i;
        wrap.querySelectorAll('.lv-btn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        // 在备战大厅提前加载刚选中的背景，进入对局时更不容易出现空白。
        if (SD.loadBg) SD.loadBg(lv.bg);
      };
      wrap.appendChild(b);
    });
  },

  refreshLobby() {
    SD.addCoins(0);
    document.getElementById('equipName1').textContent =
      SD.WEAPONS[SD.cfg.p1.weapon].name + ' · ' + SD.HELMETS[SD.cfg.p1.helmet].name;
    document.getElementById('equipName2').textContent =
      SD.WEAPONS[SD.cfg.p2.weapon].name + ' · ' + SD.HELMETS[SD.cfg.p2.helmet].name;
  },

  /* 大厅预览动画（main.js 每帧调用） */
  drawPreviews(t) {
    SD.Player.drawPreview(document.getElementById('prev1'), SD.cfg.p1, t);
    SD.Player.drawPreview(document.getElementById('prev2'), SD.cfg.p2, t + 1.3);
  },

  /* ---------- 选择器 ---------- */
  openPicker(kind, p) {
    const grid = document.getElementById('pickerGrid');
    const title = document.getElementById('pickerTitle');
    const tabs = document.getElementById('pickerTabs');
    grid.innerHTML = '';
    tabs.classList.add('hidden');
    const cur = SD.cfg['p' + p];
    const apply = (k, v) => { cur[k] = v; this.refreshLobby(); SD.AudioMan.play('coin', { vol: 0.5 }); };

    if (kind === 'color') {
      title.textContent = '选择颜色 · 玩家' + p;
      SD.COLORS.forEach(c => {
        const d = document.createElement('div');
        d.className = 'pick-item' + (cur.color === c.id ? ' on' : '');
        d.innerHTML = `<div class="color-swatch" style="background:${c.main}"></div><div class="pick-name">${c.name}</div>`;
        d.onclick = () => { apply('color', c.id); this.openPicker(kind, p); };
        grid.appendChild(d);
      });
    } else if (kind === 'weapon') {
      title.textContent = '选择武器 · 玩家' + p;
      tabs.classList.remove('hidden');
      tabs.innerHTML = '';
      SD.WEAPON_CATS.forEach((cat, i) => {
        const b = document.createElement('button');
        b.className = 'cat-btn' + (i === this.pickerCat ? ' on' : '');
        b.textContent = cat;
        b.onclick = () => { this.pickerCat = i; this.openPicker(kind, p); };
        tabs.appendChild(b);
      });
      const cat = SD.WEAPON_CATS[this.pickerCat] || '全部';
      Object.values(SD.WEAPONS).filter(w => cat === '全部' || w.cat === cat).forEach(w => {
        const owned = SD.unlocked.weapons.includes(w.id);
        const d = document.createElement('div');
        d.className = 'pick-item' + (cur.weapon === w.id ? ' on' : '') + (owned ? '' : ' locked');
        d.innerHTML = `<div class="pick-icon">${w.icon}</div><div class="pick-name">${w.name}</div>
          <div class="pick-rarity">${'★'.repeat(Math.max(1, w.rarity || 1))} · ${w.cat}</div>
          <div class="pick-desc">伤害${w.dmg}${w.hp ? ' · 生命+' + w.hp : ''} · ${w.desc}<br>小招:${w.skill.name} 大招:${w.sup.name}</div>
          ${owned ? '' : `<div class="pick-price">🔒 宝箱抽取</div>`}`;
        d.onclick = () => {
          if (!owned) { SD.FX && SD.AudioMan.play('hit', { vol: 0.3 }); return; }
          apply('weapon', w.id); this.openPicker(kind, p);
        };
        grid.appendChild(d);
      });
    } else {
      title.textContent = '选择头盔 · 玩家' + p;
      tabs.classList.add('hidden');
      Object.values(SD.HELMETS).forEach(h => {
        const owned = SD.unlocked.helmets.includes(h.id);
        const d = document.createElement('div');
        d.className = 'pick-item' + (cur.helmet === h.id ? ' on' : '') + (owned ? '' : ' locked');
        d.innerHTML = `<div class="pick-icon">${h.icon}</div><div class="pick-name">${h.name}</div>
          <div class="pick-rarity">${'★'.repeat(Math.max(1, h.rarity || 1))}</div>
          <div class="pick-desc">${h.desc}</div>${owned ? '' : `<div class="pick-price">🔒 宝箱抽取</div>`}`;
        d.onclick = () => {
          if (!owned) { SD.AudioMan.play('hit', { vol: 0.3 }); return; }
          apply('helmet', h.id); this.openPicker(kind, p);
        };
        grid.appendChild(d);
      });
    }
    this.showModal('picker');
  },

  /* ---------- 宝箱 ---------- */
  openChest() {
    // 宝箱也改为免费，不扣除金币；因为装备已全部解锁，宝箱只提供额外金币奖励。
    this.showModal('chestModal');
    const anim = document.getElementById('chestAnim');
    const reward = document.getElementById('chestReward');
    const ok = document.getElementById('btnChestOk');
    ok.classList.add('hidden');
    reward.textContent = '';
    anim.className = 'chest-anim shake';
    SD.AudioMan.play('chest');

    setTimeout(() => {
      anim.className = 'chest-anim open';
      anim.textContent = '✨';
      // 装备已经全部解锁，免费宝箱仅发放额外金币，不会再次要求购买。
      const bonus = Math.random() < 0.5 ? 80 : 120;
      SD.addCoins(bonus);
      reward.innerHTML = `免费奖励！<br><span style="font-size:52px">💰</span><br>+${bonus} 金币`;
      SD.save();
      SD.AudioMan.play('win');
      ok.classList.remove('hidden');
      this.refreshLobby();
    }, 1300);
  },

  /* ---------- 开战 ---------- */
  startBattle() {
    this.hideAll();
    this.updateTouchLayout();
    SD.AudioMan.music('battle');
    SD.game = new SD.Game({
      mode: SD.cfg.mode,
      level: SD.LEVELS[SD.cfg.level],
      diff: SD.cfg.diff,
      p1: SD.cfg.p1, p2: SD.cfg.p2,
    });
    SD.state = 'battle';
  },
};

/* 战斗结束回调（game.js 调用） */
SD.endBattle = function (winner) {
  SD.state = 'result';
  const isP1Win = winner.side === 1;
  let reward, extra = '';
  if (SD.cfg.mode === 'single') {
    reward = isP1Win ? 50 : 10;
    if (isP1Win) {
      SD.best.wins++; SD.streak = (SD.streak || 0) + 1;
      extra = '<br><small style="color:#9fb4e8;font-size:16px">🔥 连胜 x' + SD.streak + '（累计胜场 ' + SD.best.wins + '）</small>';
    } else SD.streak = 0;
    SD.save();
  } else {
    reward = 50;   // 双人对战：胜者方 +50（计入公共金币池）
  }
  SD.addCoins(reward);
  const title = SD.cfg.mode === 'single'
    ? (isP1Win ? '🏆 胜利！你击败了 AI 名将！' : '💀 败北…再练再来！')
    : '🏆 ' + winner.name + ' 获胜！';
  document.getElementById('resultTitle').textContent = title;
  document.getElementById('resultReward').innerHTML = '+' + reward + ' 💰' + extra;
  SD.AudioMan.play('win');
  SD.AudioMan.music('menu');
  SD.UI.show('result');
};
