// DeepTutor Desktop — Electron main process.
//
// Starts the FastAPI backend (PyInstaller binary) and the Next.js standalone
// frontend (run with Electron's embedded Node via ELECTRON_RUN_AS_NODE), then
// loads the frontend in a native window. Both children are terminated when
// the app quits.

const { app, BrowserWindow, dialog, Menu, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const net = require("net");
const { initAutoUpdate } = require("./updater");

const BACKEND_DEFAULT_PORT = 8001;
const FRONTEND_DEFAULT_PORT = 3782;

let backendProc = null;
let frontendProc = null;
let mainWindow = null;
let quitting = false;
let updaterApi = null;

function bootLog(message) {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "main.log"),
      `[${new Date().toISOString()}] ${message}\n`
    );
  } catch {
    // userData not available yet — nothing we can do
  }
}

function buildMenu() {
  const template = [];
  if (process.platform === "darwin") {
    template.push({
      label: app.name,
      submenu: [
        { role: "about", label: `关于 ${app.name}` },
        { type: "separator" },
        { role: "hide", label: "隐藏" },
        { role: "hideOthers", label: "隐藏其他" },
        { type: "separator" },
        { role: "quit", label: `退出 ${app.name}` },
      ],
    });
  }
  template.push(
    { role: "editMenu", label: "编辑" },
    { role: "viewMenu", label: "视图" },
    { role: "windowMenu", label: "窗口" },
    {
      label: "设置",
      submenu: [
        {
          id: "auto-update",
          label: "自动更新",
          type: "checkbox",
          checked: updaterApi ? updaterApi.menuItemState() : true,
          click: (item) => updaterApi && updaterApi.setAutoUpdateEnabled(item.checked),
        },
        { type: "separator" },
        {
          label: "立即检查更新",
          click: () => updaterApi && updaterApi.checkForUpdates({ userInitiated: true }),
        },
      ],
    }
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function resourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }
  // Development layout: this file lives in deeptutor-desktop/.
  return path.join(__dirname, ...segments);
}

function backendBinary() {
  const exe =
    process.platform === "win32" ? "deeptutor-backend.exe" : "deeptutor-backend";
  return resourcePath("backend", "deeptutor-backend", exe);
}

function frontendServerJs() {
  return resourcePath("web", "server.js");
}

function dataHome() {
  const home = path.join(app.getPath("userData"), "home");
  fs.mkdirSync(home, { recursive: true });
  return home;
}

function checkPortFree(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => tester.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });
}

function waitForUrl(url, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        req.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(attempt, 500);
        }
      });
      req.setTimeout(3000, () => req.destroy());
    };
    attempt();
  });
}

function logChild(name, proc) {
  const logDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const stream = fs.createWriteStream(path.join(logDir, `${name}.log`), {
    flags: "a",
  });
  proc.stdout.on("data", (d) => stream.write(d));
  proc.stderr.on("data", (d) => stream.write(d));
  proc.on("exit", (code, signal) =>
    stream.write(`\n[${name}] exited code=${code} signal=${signal}\n`)
  );
}

async function startBackend(port) {
  const bin = backendBinary();
  if (!fs.existsSync(bin)) {
    throw new Error(`Backend binary not found: ${bin}`);
  }
  backendProc = spawn(bin, [], {
    env: {
      ...process.env,
      DEEPTUTOR_HOME: dataHome(),
      DEEPTUTOR_BACKEND_HOST: "127.0.0.1",
      DEEPTUTOR_BACKEND_PORT: String(port),
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  logChild("backend", backendProc);
  await waitForUrl(`http://127.0.0.1:${port}/docs`);
}

function nodeRuntime() {
  // Bundled standalone Node keeps the frontend server off the Electron
  // executable — spawning DeepTutor.app's own binary with
  // ELECTRON_RUN_AS_NODE registers a second "DeepTutor (exec)" instance in
  // the Dock and Activity Monitor.
  const bundled = resourcePath("node", process.platform === "win32" ? "node.exe" : "node");
  if (fs.existsSync(bundled)) {
    return { command: bundled, env: {} };
  }
  // Fallback: Electron's embedded Node (dev builds without the bundled runtime).
  return { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } };
}

async function startFrontend(port, backendPort) {
  const serverJs = frontendServerJs();
  if (!fs.existsSync(serverJs)) {
    throw new Error(`Frontend server not found: ${serverJs}`);
  }
  const node = nodeRuntime();
  const env = {
    ...process.env,
    ...node.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    DEEPTUTOR_API_BASE_URL: `http://127.0.0.1:${backendPort}`,
    NEXT_PUBLIC_API_BASE: `http://127.0.0.1:${backendPort}`,
  };
  if (!node.env.ELECTRON_RUN_AS_NODE) {
    // The bundled runtime is plain Node; make sure the Electron compat flag
    // inherited from a parent shell does not turn it back into something else.
    delete env.ELECTRON_RUN_AS_NODE;
  }
  frontendProc = spawn(node.command, [serverJs], {
    cwd: path.dirname(serverJs),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  logChild("frontend", frontendProc);
  await waitForUrl(`http://127.0.0.1:${port}/`);
}

function killChild(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      resolve();
    }, 5000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      proc.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function shutdown() {
  await Promise.all([killChild(frontendProc), killChild(backendProc)]);
}

// CSS injected into every page on macOS: the hiddenInset title bar floats the
// traffic lights over the top-left of the web UI, which collides with the
// sidebar header. Push sidebar content below the lights and let empty sidebar
// areas drag the window (interactive elements stay clickable).
const MACOS_CHROME_CSS = `
  aside {
    padding-top: 34px !important;
    -webkit-app-region: drag;
  }
  aside a,
  aside button,
  aside input,
  aside select,
  aside textarea,
  aside [role="button"],
  aside [role="link"],
  aside [contenteditable],
  aside ul,
  aside li {
    -webkit-app-region: no-drag;
  }
`;

function createWindow(frontendPort) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "DeepTutor",
    // Native macOS chrome: traffic lights float over the page, no separate
    // dark title bar — matches current macOS app style.
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === "darwin") {
    mainWindow.webContents.on("dom-ready", () => {
      mainWindow?.webContents.insertCSS(MACOS_CHROME_CSS).catch(() => {});
    });
  }

  // External links open in the system browser, not in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.includes("127.0.0.1") && !url.includes("localhost")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${frontendPort}/`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  bootLog(`whenReady packaged=${app.isPackaged} resourcesPath=${process.resourcesPath}`);
  try {
    const backendFree = await checkPortFree(BACKEND_DEFAULT_PORT);
    const frontendFree = await checkPortFree(FRONTEND_DEFAULT_PORT);
    if (!backendFree || !frontendFree) {
      bootLog(`port conflict backendFree=${backendFree} frontendFree=${frontendFree}`);
      dialog.showErrorBox(
        "DeepTutor 端口被占用",
        `DeepTutor 需要端口 ${BACKEND_DEFAULT_PORT}（后端）和 ${FRONTEND_DEFAULT_PORT}（前端）。\n` +
          `当前${!backendFree ? ` ${BACKEND_DEFAULT_PORT}` : ""}${!frontendFree ? ` ${FRONTEND_DEFAULT_PORT}` : ""} 被占用，请关闭占用进程后重试。`
      );
      app.quit();
      return;
    }

    bootLog("starting backend");
    await startBackend(BACKEND_DEFAULT_PORT);
    bootLog("backend ready, starting frontend");
    await startFrontend(FRONTEND_DEFAULT_PORT, BACKEND_DEFAULT_PORT);
    bootLog("frontend ready, creating window");
    createWindow(FRONTEND_DEFAULT_PORT);

    updaterApi = initAutoUpdate({ log: bootLog });
    buildMenu();
    if (updaterApi.isAutoUpdateEnabled()) {
      updaterApi.checkForUpdates();
    }
  } catch (err) {
    bootLog(`startup failed: ${err && err.stack ? err.stack : err}`);
    dialog.showErrorBox("DeepTutor 启动失败", String(err && err.stack ? err.stack : err));
    await shutdown();
    app.quit();
  }
});

app.on("window-all-closed", async () => {
  if (!quitting) {
    quitting = true;
    await shutdown();
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (!quitting) {
    quitting = true;
    event.preventDefault();
    shutdown().finally(() => app.exit(0));
  }
});

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});
process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});
