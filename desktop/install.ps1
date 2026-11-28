# Установка AutoFlash для текущего пользователя: копирует собранное приложение и создаёт ярлыки.
#   powershell -ExecutionPolicy Bypass -File desktop\install.ps1
$ErrorActionPreference = "Stop"

$source = Join-Path $PSScriptRoot "out\AutoFlash-win32-x64"
if (-not (Test-Path (Join-Path $source "AutoFlash.exe"))) {
  throw "Сначала соберите приложение: npm run desktop:build"
}

$target = Join-Path $env:LOCALAPPDATA "Programs\AutoFlash"
Get-Process AutoFlash -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item (Join-Path $source "*") $target -Recurse -Force
# Снимаем пометку «файл из интернета», чтобы Windows не блокировал запуск скопированных файлов.
Get-ChildItem $target -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

$exe = Join-Path $target "AutoFlash.exe"
$shell = New-Object -ComObject WScript.Shell

function New-Shortcut($path) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = $exe
  $lnk.WorkingDirectory = $target
  $lnk.IconLocation = "$exe,0"
  $lnk.Description = "AutoFlash: диагностика и прошивки автомобилей"
  $lnk.Save()
}

$desktop = [Environment]::GetFolderPath("Desktop")
New-Shortcut (Join-Path $desktop "AutoFlash.lnk")
$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) "AutoFlash.lnk"
New-Shortcut $startMenu

Write-Host "Установлено: $target"
Write-Host "Ярлык на рабочем столе: $(Join-Path $desktop 'AutoFlash.lnk')"
