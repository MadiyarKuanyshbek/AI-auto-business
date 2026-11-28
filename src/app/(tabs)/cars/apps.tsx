import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { LANGUAGE_HINT, RECOMMENDED_APPS, explainAdbError, parseAddress, parseDevices, parsePackages, type AdbDevice } from "../../../core/adb";
import { logEvent } from "../../../liveLog";
import { useSession } from "../../../session";
import { vehicleTitle } from "../../../storage/model";
import { desktopBridge } from "../../../transport/desktop";
import { Badge, Body, Button, Card, Field, H2, Muted, Screen, colors } from "../../../ui/kit";

type Found = { ip: string; port: number };

/** Установка приложений и русификация магнитолы по Wi‑Fi (ADB). Магнитола ищется и подключается сама. */
export default function AppsScreen() {
  const bridge = desktopBridge();
  const router = useRouter();
  const { liveScan, connection } = useSession();
  const params = useLocalSearchParams<{ address?: string; usb?: string; action?: string }>();
  const [address, setAddress] = useState(params.address ?? "");
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [serial, setSerial] = useState<string | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [packages, setPackages] = useState<string[]>([]);
  const [apk, setApk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [lib, setLib] = useState<{ id: string; title: string; purpose: string; size: string; hasChecksum: boolean; downloaded: boolean; file: string | null }[]>([]);
  const [libBusy, setLibBusy] = useState<string | null>(null);
  const [drives, setDrives] = useState<{ letter: string; label: string; fileSystem: string; size: number; free: number }[]>([]);
  const [usbFile, setUsbFile] = useState<{ name: string; size: number } | null>(null);
  const [usbDrive, setUsbDrive] = useState<string | null>(null);
  const [usbBusy, setUsbBusy] = useState(false);
  const [usbMessage, setUsbMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [libMessage, setLibMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const carTitle = liveScan ? vehicleTitle(liveScan) : null;
  const demo = connection.status === "ready" && connection.kind === "demo";
  const note = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString("ru-RU")} ${line}`, ...l].slice(0, 30));

  const refresh = useCallback(async () => {
    if (!bridge) return;
    const r = await bridge.adb.run({ op: "devices" });
    const list = parseDevices(r.out);
    setDevices(list);
    setSerial((cur) => (cur && list.some((d) => d.id === cur && d.state === "device") ? cur : list.find((d) => d.state === "device")?.id ?? null));
  }, [bridge]);

  const loadPackages = useCallback(
    async (id: string | null) => {
      if (!bridge || !id) return;
      const r = await bridge.adb.run({ op: "packages", serial: id });
      if (r.ok) setPackages(parsePackages(r.out));
    },
    [bridge],
  );

  /** Подключение к магнитоле по адресу; при успехе сразу показываем следующий шаг. */
  const connectTo = useCallback(
    async (raw: string, action?: string) => {
      if (!bridge) return false;
      const a = parseAddress(raw);
      if (!a.ok) {
        setMessage({ ok: false, text: a.error });
        return false;
      }
      setBusy(true);
      setMessage(null);
      logEvent(`Магнитола: подключаюсь к ${a.address}…`);
      const r = await bridge.adb.run({ op: "connect", address: a.address });
      setBusy(false);
      if (!r.ok) {
        setMessage({ ok: false, text: explainAdbError(r.out) });
        logEvent(`Магнитола ${a.address}: не удалось подключиться`);
        return false;
      }
      logEvent(`Магнитола ${a.address}: подключено`);
      setSerial(a.address);
      setMessage({ ok: true, text: `Подключение удалось: магнитола ${a.address}` });
      setDevices(parseDevices((await bridge.adb.run({ op: "devices" })).out));
      void loadPackages(a.address);
      if (action === "locale" || action === "settings") {
        await bridge.adb.run({ op: action, serial: a.address });
        setLog((l) => [`${new Date().toLocaleTimeString("ru-RU")} ${action === "locale" ? "Открыт выбор языка на магнитоле" : "Открыты настройки магнитолы"}`, ...l].slice(0, 30));
      }
      return true;
    },
    [bridge, loadPackages],
  );

  /** Магнитола, подключённая USB-кабелем: ищем её среди устройств ADB. */
  const connectUsb = useCallback(
    async (id: string, action?: string) => {
      if (!bridge) return false;
      setBusy(true);
      setMessage(null);
      const list = parseDevices((await bridge.adb.run({ op: "devices" })).out);
      setDevices(list);
      setBusy(false);
      const dev = list.find((d) => d.id === id);
      if (!dev) {
        setMessage({ ok: false, text: "Магнитола по USB не найдена: проверьте кабель и включите на магнитоле отладку по USB." });
        return false;
      }
      if (dev.state !== "device") {
        setMessage({ ok: false, text: "Магнитола не разрешила отладку: подтвердите запрос «Разрешить отладку по USB» на её экране и нажмите «Искать магнитолу снова»." });
        return false;
      }
      logEvent(`Магнитола по USB ${id}: подключено`);
      setSerial(id);
      setMessage({ ok: true, text: `Подключение удалось: магнитола по USB-кабелю (${id})` });
      void loadPackages(id);
      if (action === "locale" || action === "settings") await bridge.adb.run({ op: action, serial: id });
      return true;
    },
    [bridge, loadPackages],
  );

  const findHeadUnits = useCallback(
    async (autoConnect: boolean) => {
      if (!bridge) return;
      setSearching(true);
      logEvent("Магнитола: ищу в сети устройства Android с отладкой…");
      let list: Found[] = [];
      try {
        list = ((await bridge.net.scan()) ?? []).filter((d) => d.port === 5555);
      } catch {
        list = [];
      }
      setFound(list);
      setSearching(false);
      setSearched(true);
      logEvent(list.length ? `Магнитола: найдено устройств: ${list.length}` : "Магнитола: в сети не найдена");
      // Подключённая USB-кабелем магнитола выбирается без адреса.
      const usb = parseDevices((await bridge.adb.run({ op: "devices" })).out).filter((d) => !d.id.includes(":"));
      if (autoConnect && usb.length === 1 && list.length === 0) return void (await connectUsb(usb[0].id));
      if (autoConnect && list.length === 1) await connectTo(`${list[0].ip}:${list[0].port}`);
    },
    [bridge, connectTo, connectUsb],
  );

  // При открытии: если пришли с радара, подключаемся по переданному адресу, иначе сами ищем магнитолу в сети.
  const started = useRef<string | null>(null);
  useEffect(() => {
    const key = `${params.address ?? ""}|${params.usb ?? ""}|${params.action ?? ""}`;
    if (!bridge || demo || started.current === key) return;
    started.current = key;
    const t = setTimeout(() => {
      void refresh();
      if (params.usb) void connectUsb(params.usb, params.action);
      else if (params.address) void connectTo(params.address, params.action);
      else void findHeadUnits(true);
    }, 150);
    return () => clearTimeout(t);
  }, [bridge, demo, params.address, params.usb, params.action, refresh, connectTo, connectUsb, findHeadUnits]);

  const loadLibrary = useCallback(async () => {
    if (!bridge) return;
    setLib(await bridge.apps.list());
  }, [bridge]);

  useEffect(() => {
    const t = setTimeout(() => void loadLibrary(), 100);
    return () => clearTimeout(t);
  }, [loadLibrary]);

  async function refreshDrives() {
    if (!bridge) return;
    const list = await bridge.usb.drives();
    setDrives(list);
    setUsbDrive((cur) => (cur && list.some((d) => d.letter === cur) ? cur : list[0]?.letter ?? null));
    if (list.length === 0) setUsbMessage({ ok: false, text: "Флешка не найдена: вставьте её в USB-порт ноутбука и нажмите «Найти флешку»." });
    else setUsbMessage(null);
  }

  async function pickUsbFile() {
    if (!bridge) return;
    const f = await bridge.usb.pickFile();
    if (f) setUsbFile(f);
  }

  async function copyToUsb() {
    if (!bridge || !usbDrive) return;
    setUsbBusy(true);
    setUsbMessage(null);
    logEvent(`Флешка ${usbDrive}: копирую ${usbFile?.name ?? "файл"}…`);
    const r = await bridge.usb.copy(usbDrive);
    setUsbBusy(false);
    if (r.ok) {
      setUsbMessage({ ok: true, text: `Готово: файл скопирован на ${r.dest} и проверен (SHA-256 ${r.sha256.slice(0, 12)}…). Безопасно извлеките флешку, вставьте в магнитолу и запустите обновление из её настроек.` });
      logEvent(`Флешка ${usbDrive}: файл скопирован и проверен`);
    } else {
      setUsbMessage({ ok: false, text: r.error });
      logEvent(`Флешка ${usbDrive}: ошибка копирования`);
    }
  }

  async function downloadApp(id: string, title: string) {
    if (!bridge) return;
    setLibBusy(id);
    setLibMessage(null);
    logEvent(`Библиотека: скачиваю ${title}…`);
    const r = await bridge.apps.download(id);
    setLibBusy(null);
    if (r.ok) {
      setLibMessage({ ok: true, text: `${title}: скачано. ${r.verified ? "Контрольная сумма совпала с сайтом разработчика." : "Источник официальный, контрольной суммы у разработчика нет."}` });
      logEvent(`Библиотека: ${title} скачано`);
    } else {
      setLibMessage({ ok: false, text: `${title}: ${r.error}` });
      logEvent(`Библиотека: ${title}: ошибка загрузки`);
    }
    await loadLibrary();
  }

  async function installFromLibrary(file: string | null) {
    if (!bridge || !file) return;
    const name = await bridge.apps.choose(file);
    if (!name) return setLibMessage({ ok: false, text: "Файл не найден в папке приложений" });
    setApk(name);
    await install();
  }

  async function sendBluetooth(file: string | null) {
    if (!bridge || !file) return;
    const r = await bridge.bluetooth.sendFile(file);
    setLibMessage(r.ok ? { ok: true, text: "Открыт мастер Windows «Передача файлов по Bluetooth»: выберите магнитолу, затем файл (папка с ним открыта). На магнитоле подтвердите приём и нажмите на файл, чтобы установить." } : { ok: false, text: r.error ?? "Не удалось открыть мастер Bluetooth" });
  }

  async function pick() {
    if (!bridge) return;
    const name = await bridge.adb.pickApk();
    if (name) setApk(name);
  }

  async function install() {
    if (!bridge || !serial) return;
    setBusy(true);
    setMessage(null);
    const r = await bridge.adb.run({ op: "install", serial });
    setBusy(false);
    const done = r.ok && /success/i.test(r.out);
    note(`Установка ${apk ?? ""}: ${done ? "успешно" : "ошибка"}`);
    logEvent(`Магнитола: установка ${apk ?? ""}: ${done ? "успешно" : "ошибка"}`);
    if (done) {
      setMessage({ ok: true, text: `Установлено: ${apk}` });
      await loadPackages(serial);
    } else setMessage({ ok: false, text: explainAdbError(r.out) });
  }

  async function uninstall(pkg: string) {
    if (!bridge || !serial) return;
    const r = await bridge.adb.run({ op: "uninstall", serial, pkg });
    note(`Удаление ${pkg}: ${r.ok ? "успешно" : "ошибка"}`);
    if (!r.ok) setMessage({ ok: false, text: explainAdbError(r.out) });
    await loadPackages(serial);
  }

  // Демо-режим: виртуальная магнитола, чтобы можно было пройти весь путь без настоящего устройства.
  if (demo) return <DemoHeadUnit carTitle={carTitle} />;

  if (!bridge) {
    return (
      <Screen>
        <H2>Установка приложений по Wi‑Fi</H2>
        <Card>
          <Body>Этот раздел работает только в настольной программе AutoFlash для Windows.</Body>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <H2>Приложения и русификация</H2>

      {/* Шаг 1: связь с магнитолой, всегда сверху и понятно */}
      <Card tone={serial ? "good" : undefined}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Body style={{ fontWeight: "800", fontSize: 17, flex: 1 }}>{serial ? "✅ Подключение удалось" : searching ? "Ищу магнитолу в сети…" : busy ? "Подключаюсь…" : "Магнитола не подключена"}</Body>
          <Badge tone={serial ? "good" : searching || busy ? "accent" : "warn"} text={serial ? "Подключено" : searching || busy ? "Поиск" : "Нет связи"} />
        </View>
        <Muted>Автомобиль: {carTitle ?? "не выбран"}{demo ? " (демо)" : ""}</Muted>
        {serial ? <Muted>Магнитола {serial.includes(":") ? `по Wi‑Fi (${serial})` : `по USB-кабелю (${serial})`}. Ниже выберите, что установить.</Muted> : null}
        {demo ? <Muted>В демо-режиме приложения на магнитолу не ставятся: нужна настоящая магнитола в вашей Wi‑Fi сети.</Muted> : null}
        {message ? <Badge tone={message.ok ? "good" : "bad"} text={message.text} /> : null}

        {!serial ? (
          <>
            <Muted>Два способа: по Wi‑Fi (ноутбук и магнитола в одной сети, например в точке доступа телефона, на магнитоле включена «Отладка по Wi‑Fi») или USB-кабелем (на магнитоле включена «Отладка по USB», подтвердите запрос на её экране).</Muted>
            {found.map((d) => (
              <Button key={`${d.ip}:${d.port}`} title={`Подключиться к магнитоле ${d.ip}`} disabled={busy} onPress={() => void connectTo(`${d.ip}:${d.port}`)} />
            ))}
            {searched && found.length === 0 && !searching ? <Muted>Магнитола не найдена. Проверьте Wi‑Fi сеть и отладку на магнитоле. Если пункта «Для разработчиков» нет, система закрыта производителем: тогда нужен внешний Android-бокс.</Muted> : null}
            <Button title={searching ? "Ищу…" : "Искать магнитолу снова"} kind="ghost" disabled={searching || busy} onPress={() => void findHeadUnits(true)} />
            <Button title={showManual ? "Скрыть ввод адреса" : "Ввести адрес вручную"} kind="ghost" onPress={() => setShowManual((v) => !v)} />
            {showManual ? (
              <>
                <Field label="Адрес магнитолы" value={address} onChangeText={setAddress} placeholder="192.168.1.50 или 192.168.1.50:5555" autoCapitalize="none" />
                <Button title={busy ? "Подключаюсь…" : "Подключиться"} disabled={busy} onPress={() => void connectTo(address)} />
              </>
            ) : null}
            <Button title="К подключению автомобиля" kind="ghost" onPress={() => router.push("/")} />
          </>
        ) : (
          <>
            {devices.map((d) => (
              <Pressable key={d.id} onPress={() => { if (d.state === "device") { setSerial(d.id); void loadPackages(d.id); } }}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Badge tone={d.state === "device" ? "good" : "warn"} text={d.state === "device" ? "Готово" : d.state === "unauthorized" ? "Нужно разрешение на экране магнитолы" : d.state} />
                  <Text style={{ color: serial === d.id ? colors.accent : colors.text, fontFamily: "monospace" }}>{d.id}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </Card>

      <H2>Библиотека приложений</H2>
      <Card>
        <Muted>Файлы скачиваются только с официальных сайтов разработчиков и проверяются. Хранятся в «Документы\AutoFlash\Apps». Поставить можно по Wi‑Fi (если магнитола подключена выше) или отправить по Bluetooth.</Muted>
        {lib.map((a) => (
          <View key={a.id} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Body style={{ fontWeight: "700" }}>{a.title}</Body>
            <Muted>{a.purpose} {a.size}.</Muted>
            {a.downloaded ? (
              <>
                <Badge tone="good" text="Скачано" />
                <Button title="Установить на магнитолу (Wi‑Fi)" disabled={!serial || busy} onPress={() => void installFromLibrary(a.file)} />
                <Button title="Отправить по Bluetooth" kind="ghost" onPress={() => void sendBluetooth(a.file)} />
              </>
            ) : (
              <Button title={libBusy === a.id ? "Скачиваю…" : `Скачать (${a.size})`} kind="ghost" disabled={libBusy !== null} onPress={() => void downloadApp(a.id, a.title)} />
            )}
          </View>
        ))}
        {libMessage ? <Badge tone={libMessage.ok ? "good" : "bad"} text={libMessage.text} /> : null}
        <Muted>Отправка по Bluetooth работает только на магнитолах, которые принимают файлы (чаще это неоригинальные Android-магнитолы). Заводские системы обычно не принимают.</Muted>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <View style={{ flexGrow: 1 }}><Button title="Открыть папку с файлами" kind="ghost" onPress={() => void bridge.apps.openFolder()} /></View>
          <View style={{ flexGrow: 1 }}><Button title="Настройки Bluetooth Windows" kind="ghost" onPress={() => void bridge.bluetooth.openSettings()} /></View>
        </View>
      </Card>

      <H2>Обновление магнитолы с USB-флешки</H2>
      <Card>
        <Muted>Для штатных магнитол: файл обновления берётся у производителя или дилера, копируется на флешку, и магнитола ставит его сама. Приложение копирует файл и проверяет его после записи. Флешка не форматируется и ничего с неё не удаляется. Формат флешки: FAT32 (файлы до 4 ГБ) или exFAT.</Muted>
        <Button title={usbFile ? `Файл: ${usbFile.name} (${(usbFile.size / 1048576).toFixed(1)} МБ)` : "Выбрать файл обновления"} kind="ghost" onPress={() => void pickUsbFile()} />
        <Button title="Найти флешку" kind="ghost" onPress={() => void refreshDrives()} />
        {drives.map((d) => (
          <Pressable key={d.letter} onPress={() => setUsbDrive(d.letter)}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Badge tone={usbDrive === d.letter ? "good" : "muted"} text={usbDrive === d.letter ? "Выбрана" : "Выбрать"} />
              <Text style={{ color: colors.text }}>{d.letter}: {d.label || "без имени"} · {d.fileSystem || "?"} · свободно {(d.free / 1073741824).toFixed(1)} ГБ</Text>
            </View>
          </Pressable>
        ))}
        <Button title={usbBusy ? "Копирую и проверяю…" : "Скопировать на флешку и проверить"} disabled={usbBusy || !usbFile || !usbDrive} onPress={() => void copyToUsb()} />
        {usbMessage ? <Badge tone={usbMessage.ok ? "good" : "bad"} text={usbMessage.text} /> : null}
      </Card>

      {serial ? (
        <>
          {/* Шаг 2: что установить */}
          <H2>Что установить в этот автомобиль</H2>
          <Card>
            <Body style={{ fontWeight: "700" }}>🇷🇺 Русификация</Body>
            <Muted>{LANGUAGE_HINT}</Muted>
            <Button title="Открыть выбор языка на магнитоле" onPress={() => void bridge.adb.run({ op: "locale", serial })} />
            <Button title="Открыть настройки магнитолы" kind="ghost" onPress={() => void bridge.adb.run({ op: "settings", serial })} />
          </Card>

          <Card>
            <Body style={{ fontWeight: "700" }}>📱 Приложение из файла .apk</Body>
            <Muted>Выберите файл приложения на ноутбуке и нажмите «Установить». Берите приложения только у разработчика или в официальном магазине.</Muted>
            <Button title={apk ? `Файл: ${apk}` : "Выбрать файл .apk"} kind="ghost" onPress={() => void pick()} />
            <Button title="Установить на магнитолу" disabled={busy || !apk} onPress={() => void install()} />
          </Card>

          <Card>
            <Body style={{ fontWeight: "700" }}>Установленные приложения</Body>
            <Button title="Показать список" kind="ghost" onPress={() => void loadPackages(serial)} />
            {packages.map((p) => (
              <View key={p} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text style={{ color: colors.text, fontFamily: "monospace", fontSize: 12, flex: 1 }}>{p}</Text>
                <Pressable onPress={() => void uninstall(p)}>
                  <Text style={{ color: colors.bad, fontSize: 13 }}>Удалить</Text>
                </Pressable>
              </View>
            ))}
            <Button title="Перезагрузить магнитолу" kind="ghost" onPress={() => void bridge.adb.run({ op: "reboot", serial })} />
          </Card>
        </>
      ) : null}

      <H2>Что обычно ставят</H2>
      <Card>
        {RECOMMENDED_APPS.map((a) => (
          <View key={a.name} style={{ gap: 4 }}>
            <Body style={{ fontWeight: "600" }}>{a.name}</Body>
            <Muted>{a.purpose}</Muted>
            <Pressable onPress={() => void Linking.openURL(a.url)}>
              <Text style={{ color: colors.accent, fontSize: 13 }}>Официальная страница</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      {log.length > 0 ? (
        <Card>
          <Body style={{ fontWeight: "700" }}>Журнал</Body>
          {log.map((l, i) => (
            <Muted key={`${i}-${l}`}>{l}</Muted>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

/** Виртуальная магнитола для демо: русификация и установка приложений ничего реального не меняют. */
function DemoHeadUnit({ carTitle }: { carTitle: string | null }) {
  const [language, setLanguage] = useState("English");
  const [installed, setInstalled] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const stamp = () => new Date().toLocaleTimeString("ru-RU");

  function setRussian() {
    setLanguage("Русский");
    setLog((l) => [`${stamp()} Язык магнитолы: Русский`, ...l]);
    logEvent("Демо: на виртуальной магнитоле выбран русский язык", false);
  }
  function install(name: string) {
    if (installed.includes(name)) return;
    setInstalled((l) => [...l, name]);
    setLog((l) => [`${stamp()} Установлено: ${name}`, ...l]);
    logEvent(`Демо: на виртуальной магнитоле установлено ${name}`, false);
  }
  function remove(name: string) {
    setInstalled((l) => l.filter((x) => x !== name));
    setLog((l) => [`${stamp()} Удалено: ${name}`, ...l]);
  }

  return (
    <Screen>
      <H2>Приложения и русификация</H2>
      <Card tone="warn">
        <Body style={{ fontWeight: "800" }}>ДЕМО: виртуальная магнитола</Body>
        <Muted>Здесь можно пройти весь путь: сменить язык и установить приложения. Ничего реального не происходит, магнитолы нет.</Muted>
        <Muted>Автомобиль: {carTitle ?? "не выбран"}</Muted>
      </Card>

      <Card tone="good">
        <Body style={{ fontWeight: "800" }}>✅ Подключение удалось: виртуальная магнитола</Body>
        <Muted>Язык сейчас: {language}</Muted>
      </Card>

      <H2>Что установить в этот автомобиль</H2>
      <Card>
        <Body style={{ fontWeight: "700" }}>🇷🇺 Русификация</Body>
        <Muted>На настоящей магнитоле приложение откроет выбор языка. Здесь можно попробовать результат.</Muted>
        <Button title={language === "Русский" ? "Русский язык выбран" : "Выбрать русский язык"} disabled={language === "Русский"} onPress={setRussian} />
        {language === "Русский" ? <Badge tone="good" text="Интерфейс магнитолы теперь на русском" /> : null}
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>📱 Приложения</Body>
        {RECOMMENDED_APPS.map((a) => (
          <View key={a.name} style={{ gap: 4, paddingVertical: 4 }}>
            <Body style={{ fontWeight: "600" }}>{a.name}</Body>
            <Muted>{a.purpose}</Muted>
            {installed.includes(a.name) ? (
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Badge tone="good" text="Установлено" />
                <Pressable onPress={() => remove(a.name)}>
                  <Text style={{ color: colors.bad, fontSize: 13 }}>Удалить</Text>
                </Pressable>
              </View>
            ) : (
              <Button title={`Установить ${a.name}`} onPress={() => install(a.name)} />
            )}
          </View>
        ))}
      </Card>

      {log.length > 0 ? (
        <Card>
          <Body style={{ fontWeight: "700" }}>Журнал</Body>
          {log.map((l, i) => (
            <Muted key={`${i}-${l}`}>{l}</Muted>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
