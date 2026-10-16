// Auto-update support for DeepTutor Desktop.
//
// - On/off switch lives in the app menu (设置 → 自动更新) and is persisted to
//   <userData>/desktop-settings.json. Default: on.
// - The update feed comes from electron-builder's `publish` config (written
//   into app-update.yml at packaging time). Point it at your own GitHub
//   fork's Releases or a generic HTTPS server hosting the artifacts.
// - Notes on platform support:
//     Windows (NSIS) and Linux (AppImage): full auto-download + install works.
//     macOS: auto-install requires a code-signed build; unsigned builds still
//     check and notify, then send the user to the download page.

const { app, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const UPDATE_PAGE_URL = "https://github.com/HKUDS/DeepTutor/releases";

let autoUpdater = null;
let logger = () => {};

function settingsFile() {
  return path.join(app.getPath("userData"), "desktop-settings.json");
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function isAutoUpdateEnabled() {
  const settings = readSettings();
  return settings.autoUpdate !== false; // default on
}

function setAutoUpdateEnabled(enabled) {
  writeSettings({ autoUpdate: enabled });
  logger(`auto-update ${enabled ? "enabled" : "disabled"}`);
  if (enabled) {
    checkForUpdates({ userInitiated: true });
  }
}

function menuItemState() {
  return isAutoUpdateEnabled();
}

function checkForUpdates({ userInitiated = false } = {}) {
  if (!autoUpdater) return;
  if (!app.isPackaged) {
    logger("auto-update skipped: dev build");
    if (userInitiated) {
      dialog.showMessageBox({
        type: "info",
        message: "开发模式不支持自动更新",
        detail: "自动更新只在打包后的应用中生效。",
      });
    }
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    logger(`update check failed: ${err && err.message ? err.message : err}`);
    if (userInitiated) {
      dialog.showMessageBox({
        type: "warning",
        message: "检查更新失败",
        detail:
          "无法连接更新服务器。请确认打包配置中的 publish 地址指向你自己的 Release 源，\n" +
          "或稍后再试。也可以手动访问发布页下载新版本。",
        buttons: ["打开发布页", "知道了"],
        defaultId: 1,
      }).then(({ response }) => {
        if (response === 0) shell.openExternal(UPDATE_PAGE_URL);
      });
    }
  });
}

function wireEvents() {
  autoUpdater.on("checking-for-update", () => logger("checking for update"));
  autoUpdater.on("update-available", (info) => {
    logger(`update available: ${info.version}`);
    dialog.showMessageBox({
      type: "info",
      message: `发现新版本 v${info.version}`,
      detail: "正在后台下载，下载完成后会提示你重启安装。",
      buttons: ["知道了"],
    });
  });
  autoUpdater.on("update-not-available", () => logger("already up to date"));
  autoUpdater.on("error", (err) => {
    // checkForUpdates() promise already reports errors; this prevents crashes.
    logger(`updater error: ${err && err.message ? err.message : err}`);
  });
  autoUpdater.on("download-progress", (p) =>
    logger(`download ${Math.round(p.percent)}%`)
  );
  autoUpdater.on("update-downloaded", (info) => {
    logger(`update downloaded: ${info.version}`);
    dialog
      .showMessageBox({
        type: "info",
        message: `新版本 v${info.version} 已下载完成`,
        detail: "重启应用即可完成安装。",
        buttons: ["立即重启安装", "稍后"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });
}

function initAutoUpdate({ log } = {}) {
  if (typeof log === "function") logger = log;
  if (!app.isPackaged) {
    logger("auto-update initialized (dev build, checks disabled)");
    return { isAutoUpdateEnabled, setAutoUpdateEnabled, menuItemState, checkForUpdates };
  }
  try {
    autoUpdater = require("electron-updater").autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    wireEvents();
    logger("auto-update initialized");
  } catch (err) {
    logger(`auto-update unavailable: ${err && err.message ? err.message : err}`);
  }
  return { isAutoUpdateEnabled, setAutoUpdateEnabled, menuItemState, checkForUpdates };
}

module.exports = {
  initAutoUpdate,
};
