const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  isFullscreen: () => ipcRenderer.invoke("is-fullscreen"),
  exitFullscreen: () => ipcRenderer.invoke("exit-fullscreen"),
  onFullscreenChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("fullscreen-changed", listener);
  },
});
