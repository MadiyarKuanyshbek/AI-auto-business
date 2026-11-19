// Сборка настольного приложения: веб-интерфейс → папка → AutoFlash.exe (Windows x64).
//   npm run desktop:build
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const stage = path.join(root, "desktop", "stage");
const out = path.join(root, "desktop", "out");
const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

console.log("1/3 Сборка интерфейса…");
execSync(`npx expo export --platform web --output-dir "${path.join(stage, "web")}"`, { cwd: root, stdio: "inherit" });

console.log("2/3 Подготовка приложения…");
for (const f of ["main.cjs", "preload.cjs", "selftest.cjs", "icon.ico"]) {
  fs.copyFileSync(path.join(root, "desktop", f), path.join(stage, f));
}
fs.writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify({ name: "autoflash", productName: "AutoFlash", version: require(path.join(root, "package.json")).version ?? "0.1.0", description: "Диагностика и прошивки автомобилей", main: "main.cjs" }, null, 2),
);

console.log("3/3 Упаковка в .exe…");
const mod = await import("@electron/packager");
const packager = mod.packager ?? mod.default;
const result = await packager({
  dir: stage,
  out,
  name: "AutoFlash",
  platform: "win32",
  arch: "x64",
  electronVersion,
  icon: path.join(root, "desktop", "icon.ico"),
  overwrite: true,
  asar: true,
  prune: false,
  appCopyright: "AutoFlash",
});
console.log("Готово:", result.join(", "));
