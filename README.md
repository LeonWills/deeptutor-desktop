# DeepTutor Desktop

DeepTutor 的桌面打包：Electron 外壳 + PyInstaller 独立后端 + Next.js standalone 前端。
三个平台共用同一份代码，但 **每个平台的安装包必须在对应系统上构建**（PyInstaller
不能交叉编译，Next.js standalone 里的 swc 也是平台原生二进制）。

## 目录结构

```
deeptutor-desktop/
├── main.js                     # Electron 主进程：拉起后端/前端、窗口、菜单
├── updater.js                  # 自动更新（electron-updater + 菜单开关）
├── build/
│   ├── backend_entry.py        # 后端 PyInstaller 入口（uvicorn）
│   ├── deeptutor-backend.spec  # PyInstaller spec（三平台通用，读环境变量）
│   └── icon.png                # 应用图标（1024x1024，electron-builder 自动转 icns/ico）
├── scripts/
│   ├── build-backend.sh        # macOS / Linux 后端构建
│   └── build-backend.ps1       # Windows 后端构建
└── package.json                # electron-builder 配置（mac / win / linux）
```

## 前置条件

| 平台 | 需要 |
|---|---|
| 全部 | Node.js 20+、Python 3.11–3.14、DeepTutor 源码在 `../DeepTutor`（或用 `DEEPTUTOR_SRC` 指定） |
| Windows | PowerShell、`py` launcher 或 PATH 中的 python |
| Linux | 构建 deb 需要 `dpkg`，AppImage 需要 FUSE（Docker 里构建可忽略） |

## 构建步骤（每个平台相同）

```bash
# 1. 构建后端二进制（自动建 venv、装依赖、跑 PyInstaller）
#    macOS / Linux
npm run build:backend
#    Windows
npm run build:backend:win

# 2. 构建前端 standalone（在 DeepTutor 源码目录里，目标平台上执行）
cd ../DeepTutor/web
npm ci --legacy-peer-deps
npm run build        # 产出 .next/；首次 deeptutor start 或手动构建会生成 standalone
# 若只要 standalone 产物：
DEEPTUTOR_NEXT_DIST_DIR=.next-deeptutor npx next build
# standalone 目录需要补静态资源（对标 deeptutor/runtime/launcher.py 的逻辑）：
mkdir -p .next-deeptutor/standalone/.next-deeptutor
cp -r .next-deeptutor/static .next-deeptutor/standalone/.next-deeptutor/static
cp -r public .next-deeptutor/standalone/public

# 3. 准备前端用的独立 Node 运行时（避免用 Electron 二进制当 Node，
#    否则 macOS 会把前端进程注册成第二个 DeepTutor 应用实例）
cd ../../deeptutor-desktop
bash scripts/fetch-node.sh darwin-arm64        # macOS Apple Silicon
bash scripts/fetch-node.sh darwin-x64          # macOS Intel
bash scripts/fetch-node.sh linux-x64           # Linux
powershell -File scripts/fetch-node.ps1        # Windows

# 4. 打包桌面应用
npm install
npm run dist          # macOS: .app + .dmg
npm run dist:win      # Windows: NSIS 安装包 + zip
npm run dist:linux    # Linux: AppImage + deb
```

产物在 `release/`。

## 发布流水线（GitHub Actions）

`.github/workflows/release.yml` 提供三平台一键发布：

1. 把 `deeptutor-desktop/` 目录推到你自己的 GitHub 仓库（仓库根即本目录）。
2. 打 tag 触发：`git tag desktop-v1.6.15 && git push origin desktop-v1.6.15`，
   或在 Actions 页面手动运行（可选上游 DeepTutor 的分支/tag 与版本号）。
3. 流水线在 macos / windows / ubuntu 三个 runner 上分别克隆上游 DeepTutor
   源码、构建后端二进制与前端 standalone、下载独立 Node 运行时，最后用
   electron-builder 打包并**发布到该仓库的 GitHub Releases**（含
   `latest*.yml` 更新清单，自动更新即指向这里）。
4. 产物同时作为 workflow artifacts 备份。

注意：

- 版本号取自 tag（`desktop-v1.6.15` → `1.6.15`）或手动输入，必须递增，
  否则已安装的客户端不会认为这是更新。
- macOS 的自动安装需要 Apple 签名：在仓库 Secrets 里配置 `CSC_LINK`
  （base64 的 .p12 证书）和 `CSC_KEY_PASSWORD`，并在
  `electron-builder.config.js` 里移除 `identity: null`。未签名时 macOS
  客户端只提示新版本，需手动下载。
- Windows / Linux 的构建在本机 mac 上无法验证，首次跑 CI 如遇依赖编译
  问题，看对应 runner 的日志即可定位。

## 自动更新

- 菜单栏「设置 → 自动更新」是总开关，勾选状态持久化在
  `<userData>/desktop-settings.json`，默认开启；「立即检查更新」可手动触发。
- 更新源由 `electron-builder.config.js` 里的 `publish` 决定：CI 中自动取
  `GITHUB_REPOSITORY`（即你的仓库），本地构建回退到占位符；也可用
  `UPDATE_FEED_OWNER` / `UPDATE_FEED_REPO` 环境变量覆盖。
- 平台差异：
  - Windows (NSIS) / Linux (AppImage)：自动下载、重启安装全流程可用。
  - macOS：**自动安装要求应用经过 Apple 签名**（Squirrel.Mac 限制）。未签名
    构建仍会检查并提示新版本，用户可跳转到发布页手动下载。

## 运行时行为

- 后端固定监听 `127.0.0.1:8001`，前端 `127.0.0.1:3782`；被占用时弹窗提示并退出。
- 用户数据（知识库、对话、设置）在 `<userData>/home/`：
  - macOS: `~/Library/Application Support/deeptutor-desktop/home/`
  - Windows: `%APPDATA%/deeptutor-desktop/home/`
  - Linux: `~/.config/deeptutor-desktop/home/`
- 日志在 `<userData>/logs/`（main / backend / frontend 三个文件）。
- 首次使用需在应用内配置 LLM 提供商 API Key。
