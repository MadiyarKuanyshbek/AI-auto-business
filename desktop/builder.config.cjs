// Настройка установщика Windows (мастер с выбором папки, ярлыки, удаление). Собирается из готовой папки приложения:
//   npm run desktop:installer
module.exports = {
  appId: "kz.autoflash.desktop",
  productName: "AutoFlash",
  directories: { output: "desktop/dist" },
  artifactName: "AutoFlash-Setup-${version}.exe",
  win: { target: [{ target: "nsis", arch: ["x64"] }], icon: "desktop/icon.ico" },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "AutoFlash",
    language: "1049",
    installerIcon: "desktop/icon.ico",
    uninstallerIcon: "desktop/icon.ico",
    deleteAppDataOnUninstall: false,
  },
  publish: null,
};
