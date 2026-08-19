const {
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  ipcMain,
  dialog,
  shell,
} = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

const GITHUB_OWNER = "solisXOi";
const GITHUB_REPO = "music-viz-desktop";

let mainWindow = null;

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  autoUpdater.setFeedURL({
    provider: "github",
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    private: true,
    ...(token ? { token } : {}),
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-update error:", err);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (!mainWindow) {
      autoUpdater.quitAndInstall();
      return;
    }

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Music Viz update",
      message: `Version ${info.version} is ready to install.`,
      detail: "Restart now to apply the update, or keep playing and it will install the next time you quit.",
    });

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error("Update check failed:", err);
    });
  }, 4000);
}

function setupLoopbackCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 0, height: 0 },
        });

        const source = sources[0];
        if (!source) {
          callback({});
          return;
        }

        callback({
          video: source,
          audio: "loopback",
        });
      } catch (err) {
        console.error("Loopback capture failed:", err);
        callback({});
      }
    },
    { useSystemPicker: false }
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: "#050508",
    autoHideMenuBar: true,
    title: "Music Viz",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const indexPath = path.join(__dirname, "..", "dist", "renderer", "index.html");
  mainWindow.loadFile(indexPath);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("enter-full-screen", () => {
    mainWindow.webContents.send("fullscreen-changed", true);
  });

  mainWindow.on("leave-full-screen", () => {
    mainWindow.webContents.send("fullscreen-changed", false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("toggle-fullscreen", () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle("is-fullscreen", () => {
  return mainWindow?.isFullScreen() ?? false;
});

ipcMain.handle("exit-fullscreen", () => {
  mainWindow?.setFullScreen(false);
});

app.whenReady().then(() => {
  setupLoopbackCapture();
  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
