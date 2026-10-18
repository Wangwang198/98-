# 98班美国电竞房

这是一个静态网页小游戏，使用 HTML、CSS、JavaScript 和本地资源文件，无需安装服务器端程序。

## 本地运行

1. 下载并解压整个项目。
2. 保持 `index.html`、`css`、`js`、`assets` 的相对位置不变。
3. 打开 `index.html` 即可尝试运行。部分浏览器可能限制本地音频播放；若遇到问题，请通过静态网页托管访问。

## 发布到 GitHub Pages

1. 将本项目中的所有文件和文件夹上传到 GitHub 仓库的**根目录**。
2. 进入仓库 `Settings` → `Pages`。
3. 在 `Build and deployment` 中选择 `Deploy from a branch`。
4. Branch 选择 `main`，目录选择 `/(root)`，然后保存。
5. 等待 GitHub Pages 部署完成，页面会显示网站地址。

注意：`index.html` 必须位于所选发布目录的最外层；不要只上传 ZIP 文件，也不要改变 `assets`、`css`、`js` 的文件夹名称或相对结构。文件夹名称没有扩展名，文件才有扩展名，例如 `index.html`、`style.css`、`main.js`、`song.mp3`。

## 目录结构

```text
仓库根目录/
├── index.html
├── .nojekyll
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── game.js
│   ├── player.js
│   ├── weapons.js
│   ├── effects.js
│   ├── ai.js
│   ├── ui.js
│   ├── audio.js
│   └── assets.js
└── assets/
    ├── bg/
    ├── fx/
    ├── img/
    ├── music/
    └── sfx/
```

## 兼容性

建议使用较新的 Chrome、Edge 或 Chromium 浏览器。旧版 Windows 7 浏览器可能不支持部分现代网页功能；请在目标电脑上实际测试。浏览器通常会要求用户先与页面互动，之后才能播放音乐。


## 本次更新（2026-10-17）
- 本地音乐列表扩充为 11 首，所有新增音频都放在 `assets/music/`。
- 公告已更新为：“本网仅为个人娱乐而制作，不存在非法钓鱼行为，请大家放心耍起，如被老师发现，请不要提起我的名字”。
- 移除了对局 Canvas 上的暗棕色外框。
- 新增 `assets/img/rider-mouse.png` 右上角趣味贴纸，带轻微浮动动画。
- 文件结构适用于 GitHub Pages；更新到已部署仓库时，请上传新增音频/图片并替换 `index.html`、`css/style.css`、`js/game.js` 和 `js/ui.js`。

## 最新修正（2026-10-18）
- 公告文字更正为：本网站仅为娱乐而制作，不存在非法钓鱼行为，请大家放心耍起，如被老师发现，请不要提起我的名字。
- 新增左上角透明背景的 FGY 举牌贴纸，并带轻微浮动动画。
- 新素材位于 `assets/img/creator-fgy.png`，保留原有 `assets/img/rider-mouse.png`。
