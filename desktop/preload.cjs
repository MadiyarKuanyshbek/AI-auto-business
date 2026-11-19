const { contextBridge, ipcRenderer } = require("electron");

// Узкий и явный мост между интерфейсом и системой: только то, что нужно приложению.
const dataListeners = new Set();
const closeListeners = new Set();
ipcRenderer.on("tcp:data", (_e, msg) => dataListeners.forEach((l) => l(msg.id, msg.text)));
ipcRenderer.on("tcp:close", (_e, msg) => closeListeners.forEach((l) => l(msg.id)));

contextBridge.exposeInMainWorld("autoflash", {
  desktop: true,
  platform: process.platform,
  tcp: {
    connect: (host, port) => ipcRenderer.invoke("tcp:connect", { host, port }),
    write: (id, text) => ipcRenderer.invoke("tcp:write", { id, text }),
    close: (id) => ipcRenderer.send("tcp:close", { id }),
    onData: (cb) => {
      dataListeners.add(cb);
      return () => dataListeners.delete(cb);
    },
    onClose: (cb) => {
      closeListeners.add(cb);
      return () => closeListeners.delete(cb);
    },
  },
  backup: {
    save: (json, name) => ipcRenderer.invoke("backup:save", { json, name }),
    openFolder: () => ipcRenderer.invoke("backup:open-folder"),
  },
  chooser: {
    onList: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("chooser:list", handler);
      return () => ipcRenderer.removeListener("chooser:list", handler);
    },
    pick: (kind, id) => ipcRenderer.send("chooser:pick", { kind, id }),
  },
});
