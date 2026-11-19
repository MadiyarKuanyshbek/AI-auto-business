# Пакет прошивки (.afpkg)

Пакет — JSON-файл, из которого приложение само устанавливает прошивку в блок по UDS (ISO 14229) через адаптер на чипе **STN** (OBDLink CX/MX+ и др.) по Bluetooth LE, Wi-Fi или USB. Обычные ELM327 длинные сообщения отправлять не умеют, поэтому приложение через них не прошивает.

```json
{
  "format": "autoflash-package",
  "formatVersion": 1,
  "id": "golf6-edc17-stage1",
  "version": "1.0.0",
  "title": "Название",
  "description": "Что делает пакет",
  "target": {
    "softwareNumbers": ["1037525811"],
    "txId": "7E0",
    "vehicles": [{ "make": "Volkswagen", "model": "Golf", "from": 2008, "to": 2012 }]
  },
  "expectedSoftwareNumber": "1037525811-ABCD",
  "procedure": {
    "kind": "uds-download",
    "extendedSession": 3,
    "disableDtc": true,
    "programmingSession": 2,
    "security": { "level": 17, "algorithm": "имя-алгоритма", "params": {} },
    "erase": { "routineId": 65280 },
    "download": { "dataFormat": 0, "addressAndLengthFormat": 68 },
    "check": { "routineId": 514 },
    "resetType": 1,
    "backup": { "address": 524288, "length": 8192, "chunk": 1024 }
  },
  "segments": [{ "address": 524288, "dataBase64": "...", "sha256": "..." }],
  "roadLegal": true
}
```

## Правила, которые приложение проверяет само

- Контрольная сумма каждого сегмента (`sha256`) и отсутствие пересечений по адресам.
- Номер ПО блока должен **точно** совпасть с одним из `target.softwareNumbers`, иначе установка блокируется.
- Без описания `procedure.backup` установка не запускается: резервная копия оригинала обязательна.
- После перезапуска блока читается номер ПО и сверяется с `expectedSoftwareNumber`; при несовпадении предлагается вернуть оригинал.
- Для Bluetooth/Wi-Fi требуется отдельное подтверждение риска обрыва связи, для всех — согласие владельца авто.
- Обновления: пакеты с тем же `id` сравниваются по `version`; новая версия предлагается как «Обновить».

## Что должен подготовить автор пакета

Адреса памяти, процедуру стирания и проверки, формат адреса/длины, а главное — **алгоритм вычисления ключа** SecurityAccess для этого семейства блоков. Алгоритмы добавляются в `SECURITY_ALGORITHMS` (`src/core/package.ts`); в приложении есть только демонстрационный `demo-xor-add` для виртуального блока.

Собрать пакет из байтов можно функцией `buildPackage` (`src/core/package.ts`).
