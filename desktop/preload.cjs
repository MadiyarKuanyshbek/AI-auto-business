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
    saveAs: (json) => ipcRenderer.invoke("backup:save-as", { json }),
    load: () => ipcRenderer.invoke("backup:load"),
    getMirror: () => ipcRenderer.invoke("backup:get-mirror"),
    chooseMirror: () => ipcRenderer.invoke("backup:choose-mirror"),
    clearMirror: () => ipcRenderer.invoke("backup:clear-mirror"),
  },
  files: {
    savePdf: (html, name) => ipcRenderer.invoke("pdf:save", { html, name }),
    reveal: (file) => ipcRenderer.invoke("file:reveal", { file }),
    exportLog: (text) => ipcRenderer.invoke("log:export", { text }),
    saveText: (text, name, ext) => ipcRenderer.invoke("file:save-text", { text, name, ext }),
  },
  radio: {
    get: () => ipcRenderer.invoke("radio:get"),
    set: (kind, on) => ipcRenderer.invoke("radio:set", { kind, on }),
  },
  apps: {
    list: () => ipcRenderer.invoke("apps:list"),
    download: (id) => ipcRenderer.invoke("apps:download", { id }),
    choose: (file) => ipcRenderer.invoke("apps:choose", { file }),
    openFolder: () => ipcRenderer.invoke("apps:open-folder"),
  },
  update: {
    check: () => ipcRenderer.invoke("update:check"),
    open: (url) => ipcRenderer.invoke("update:open", { url }),
  },
  j2534: { list: () => ipcRenderer.invoke("j2534:list") },
  usb: {
    drives: () => ipcRenderer.invoke("usb:drives"),
    pickFile: () => ipcRenderer.invoke("usb:pick-file"),
    copy: (letter) => ipcRenderer.invoke("usb:copy", { letter }),
    setFileForTest: (file) => ipcRenderer.invoke("usb:set-file-for-test", file),
  },
  bluetooth: {
    sendFile: (file) => ipcRenderer.invoke("bluetooth:send-file", { file }),
    openSettings: () => ipcRenderer.invoke("bluetooth:open-settings"),
  },
  net: { scan: () => ipcRenderer.invoke("net:scan") },
  adb: {
    run: (args) => ipcRenderer.invoke("adb:run", args),
    pickApk: () => ipcRenderer.invoke("adb:pick-apk"),
    setApkForTest: (file) => ipcRenderer.invoke("adb:set-apk-for-test", file),
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
