import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, Switch, Text, View } from "react-native";
import { parseDevices } from "../../core/adb";
import { matchScannedCar } from "../../core/cars";
import { DEMO_VEHICLES } from "../../core/sim/vehicles";
import { useSession } from "../../session";
import { useStore } from "../../storage/store";
import { ble } from "../../transport/ble";
import type { BleDeviceInfo } from "../../transport/types";
import { pickSerialTransport, serialSupported } from "../../transport/serial";
import { createWifiTransport, wifiSupported } from "../../transport/wifi";
import { vehicleTitle } from "../../storage/model";
import { resolveModelYear } from "../../core/vin";
import { desktopBridge } from "../../transport/desktop";
import { ActionSheet, type SheetAction } from "../../ui/ActionSheet";
import { Badge, Body, Button, Card, Field, H1, H2, Muted, Progress, Row, Screen, colors } from "../../ui/kit";
import { logEvent } from "../../liveLog";
import { LiveMonitor, RadioPanel } from "../../ui/LiveStatus";
import { Radar, type Blip } from "../../ui/Radar";

type Mode = "ble" | "serial" | "wifi";

export default function ConnectScreen() {
  const router = useRouter();
  const session = useSession();
  const store = useStore();
  const { settings } = store.data;
  const [j2534, setJ2534] = useState<{ name: string; vendor: string }[]>([]);
  const { connection } = session;
  const [mode, setMode] = useState<Mode>("ble");
  const [viewMode, setViewMode] = useState<"real" | "demo">("real");
  const [devices, setDevices] = useState<BleDeviceInfo[]>([]);
  const [scanningBle, setScanningBle] = useState(false);
  const [bleError, setBleError] = useState<string | null>(null);
  const [host, setHost] = useState("192.168.0.10");
  const [port, setPort] = useState("35000");
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  async function startBleScan() {
    setBleError(null);
    setDevices([]);
    setScanningBle(true);
    try {
      stopRef.current = await ble.startScan(
        (d) => setDevices((list) => [...list, d].sort((a, b) => Number(/obd|elm|vgate|vlinker|veepeak|icar/i.test(b.name)) - Number(/obd|elm|vgate|vlinker|veepeak|icar/i.test(a.name)))),
        (m) => {
          setBleError(m);
          setScanningBle(false);
        },
      );
      setTimeout(() => {
        stopRef.current?.();
        setScanningBle(false);
      }, 12000);
    } catch (e) {
      setBleError(e instanceof Error ? e.message : "Не удалось начать поиск");
      setScanningBle(false);
    }
  }

  async function pickWebBle() {
    setBleError(null);
    try {
      const transport = await ble.pick();
      if (transport) await session.connect(transport);
    } catch (e) {
      if (e instanceof Error && e.name !== "NotFoundError") setBleError(e.message);
    }
  }

  async function connectSerial() {
    setBleError(null);
    try {
      await session.connect(await pickSerialTransport());
    } catch (e) {
      // Пользователь закрыл окно выбора порта — это не ошибка.
      if (e instanceof Error && e.name !== "NotFoundError") setBleError(e.message);
    }
  }

  async function connectBle(d: BleDeviceInfo) {
    stopRef.current?.();
    setScanningBle(false);
    await session.connect(ble.connect(d));
  }

  async function connectWifi() {
    try {
      await session.connect(createWifiTransport(host.trim(), Number(port) || 35000));
    } catch (e) {
      setBleError(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function scan() {
    await session.runScan();
  }

  const ready = connection.status === "ready";
  // Демо и реальная работа показываются раздельно: при подключении режим выбирается по самому подключению.
  const view: "real" | "demo" = ready ? (connection.kind === "demo" ? "demo" : "real") : settings.showDemo ? viewMode : "real";
  const [showManual, setShowManual] = useState(false);
  const [radarScanning, setRadarScanning] = useState(false);
  const [found, setFound] = useState<Blip[]>([]);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Blip | null>(null);
  const bridge = desktopBridge();
  const scanToken = useRef(0);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Радар: сначала появляются демо-автомобили, затем устройства, найденные в сети.
  const startRadar = useCallback(async () => {
    const token = ++scanToken.current;
    setRadarScanning(true);
    setFound([]);
    const add = (b: Blip) => {
      if (token !== scanToken.current) return; // поиск уже сменился (другой режим или повторный запуск)
      setFound((l) => (l.some((x) => x.id === b.id) ? l : [...l, b]));
    };
    if (view === "demo") {
      logEvent("Демо: показываю виртуальные автомобили", false);
      DEMO_VEHICLES.forEach((v, i) => setTimeout(() => add({ id: `demo-${i}`, kind: "car", label: v.short ?? v.label, sub: v.label }), 500 + i * 450));
      setTimeout(() => token === scanToken.current && setRadarScanning(false), 500 + DEMO_VEHICLES.length * 450 + 600);
      return;
    }
    logEvent("Радар: ищу настоящие устройства в сети…");
    try {
      const list = (await bridge?.net.scan()) ?? [];
      for (const d of list) {
        if (d.port === 5555) add({ id: `adb-${d.ip}:${d.port}`, kind: "adb", label: `Магнитола ${d.ip}`, sub: "ADB" });
        else add({ id: `obd-${d.ip}:${d.port}`, kind: "obd", label: `Wi‑Fi адаптер ${d.ip}`, sub: `порт ${d.port}` });
        logEvent(`Радар: найдено ${d.port === 5555 ? "устройство Android (ADB)" : "Wi‑Fi адаптер OBD"} ${d.ip}:${d.port}`);
      }
      if (list.length === 0) logEvent("Радар: устройств в сети не найдено (Wi‑Fi адаптеры и магнитолы)");
      // Магнитолы, подключённые USB-кабелем (отладка по USB), видны через ADB.
      const usb = parseDevices((await bridge?.adb.run({ op: "devices" }))?.out ?? "").filter((d) => !d.id.includes(":") && !d.id.startsWith("emulator"));
      for (const d of usb) {
        add({ id: `adbusb-${d.id}`, kind: "adb", label: "Магнитола по USB", sub: d.id });
        logEvent(`Радар: найдена магнитола по USB-кабелю ${d.id}`);
      }
    } catch {
      // Сеть недоступна: остаются демо-автомобили и ручное подключение.
    }
    setTimeout(() => token === scanToken.current && setRadarScanning(false), 1200);
  }, [bridge, view]);

  // Подключение и определение автомобиля в журнале событий; когда авто определено, сразу предлагаем, что делать дальше.
  const { liveScan } = session;
  const lastStatus = useRef<string>("idle");
  useEffect(() => {
    if (lastStatus.current === connection.status) return;
    lastStatus.current = connection.status;
    if (connection.status === "connecting") logEvent(`Подключаюсь: ${connection.label}`, connection.label.indexOf("Демо") !== 0);
    if (connection.status === "ready") logEvent(`Подключено: ${connection.label}`, connection.kind !== "demo");
    if (connection.status === "error") logEvent(`Ошибка подключения: ${connection.message}`);
    if (connection.status === "idle") logEvent("Отключено");
  }, [connection]);
  const offered = useRef<string | null>(null);
  useEffect(() => {
    if (!liveScan || connection.status !== "ready") {
      if (connection.status !== "ready") offered.current = null;
      return;
    }
    if (!focused || offered.current === (liveScan.vin ?? "no-vin")) return;
    offered.current = liveScan.vin ?? "no-vin";
    logEvent(`Автомобиль определён: ${vehicleTitle(liveScan)}`, connection.kind !== "demo");
    const t = setTimeout(() => setSheet({ id: "connected", kind: "car", label: vehicleTitle(liveScan), sub: "Подключено", connected: true }), 400);
    return () => clearTimeout(t);
  }, [liveScan, connection, focused]);

  useEffect(() => {
    const t = setTimeout(() => void desktopBridge()?.j2534.list().then(setJ2534), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void startRadar(), 300);
    return () => clearTimeout(t);
  }, [startRadar]);

  const blips: Blip[] = found.map((b) => ({ ...b, connected: ready && connectedId === b.id }));
  if (ready && !blips.some((b) => b.connected)) blips.push({ id: "connected", kind: "car", label: connection.label, sub: "Подключено", connected: true });

  async function sheetConnect(b: Blip) {
    setSheet(null);
    setConnectedId(b.id);
    if (b.id.startsWith("demo-")) await session.connectDemo(Number(b.id.slice(5)));
    else if (b.id.startsWith("obd-")) {
      const [ip, port] = b.id.slice(4).split(":");
      await session.connect(createWifiTransport(ip, Number(port) || 35000));
    }
  }

  function sheetActions(b: Blip): SheetAction[] {
    const go = (path: string, params?: Record<string, string>) => () => {
      setSheet(null);
      router.push({ pathname: path as never, params } as never);
    };
    if (b.connected) {
      return [
        { title: "Прошивка блоков", hint: "Блоки этого автомобиля и пакеты для них", onPress: go("/cars", { section: "blocks" }) },
        { title: "Русификация", hint: "Сделать интерфейс магнитолы на русском", kind: "ghost", onPress: go("/cars/task", { kind: "russify" }) },
        { title: "Установка приложений", hint: "Навигатор, музыка, видео на магнитоле", kind: "ghost", onPress: go("/cars/task", { kind: "apps" }) },
        { title: "Интерфейс и экраны", hint: "Как будет выглядеть салон", kind: "ghost", onPress: go("/interface") },
        { title: "Отключиться", kind: "ghost", onPress: () => { setSheet(null); void session.disconnect(); } },
      ];
    }
    if (b.kind === "adb") {
      const via: Record<string, string> = b.id.startsWith("adbusb-") ? { usb: b.id.slice(7) } : { address: b.id.slice(4) };
      return [
        { title: "Установить приложения", hint: "Яндекс Навигатор, 2ГИС, VLC и другие", onPress: go("/cars/apps", via) },
        { title: "Русификация: выбор языка", hint: "Откроет выбор языка на экране магнитолы", kind: "ghost", onPress: go("/cars/apps", { ...via, action: "locale" }) },
        { title: "Настройки магнитолы", kind: "ghost", onPress: go("/cars/apps", { ...via, action: "settings" }) },
      ];
    }
    if (b.kind === "obd") return [{ title: "Подключиться к адаптеру", hint: "Автомобиль определится сам", onPress: () => void sheetConnect(b) }];
    return [{ title: "Подключиться и определить авто", hint: "Виртуальный автомобиль для показа и проверки", onPress: () => void sheetConnect(b) }];
  }

  return (
    <Screen>
      <H1>AutoFlash</H1>
      {ready ? <ConnectedHero onGo={(path, params) => router.push({ pathname: path as never, params } as never)} /> : null}

      {settings.showDemo && !ready ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([["real", "Реальный режим"], ["demo", "Демо-режим"]] as const).map(([key, label]) => (
            <Pressable
              key={key}
              testID={`view-${key}`}
              onPress={() => setViewMode(key)}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: view === key ? (key === "demo" ? colors.warn : colors.accent) : colors.card, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: view === key && key === "demo" ? "#111" : colors.text, fontWeight: "800" }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {view === "demo" && !ready ? (
        <Card tone="warn">
          <Body style={{ fontWeight: "700" }}>ДЕМО: виртуальные автомобили</Body>
          <Muted>Настоящий адаптер не используется, в реальную машину ничего не записывается. Подходит, чтобы показать приложение.</Muted>
        </Card>
      ) : view === "real" && !ready ? (
        <Muted>Реальный режим: ищу настоящие Wi‑Fi адаптеры OBD и магнитолы в вашей сети. Bluetooth и COM-порт добавляются кнопками под радаром.</Muted>
      ) : null}

      {!ready ? (
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <H2>Радар</H2>
          <Badge tone={radarScanning ? "accent" : "muted"} text={radarScanning ? "Поиск…" : `Найдено: ${blips.length}`} />
        </View>
        <Radar blips={blips} scanning={radarScanning} paused={!focused} onPick={setSheet} />
        <Muted>{view === "demo" ? "🚗 виртуальные автомобили" : "📡 Wi‑Fi адаптеры OBD · 📺 магнитолы · 🔵 Bluetooth"}</Muted>
        {blips.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Body style={{ fontWeight: "700" }}>Найдено: нажмите, чтобы выбрать</Body>
            {blips.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => setSheet(b)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: b.connected ? colors.good : colors.border, backgroundColor: colors.cardAlt }}
              >
                <Text style={{ fontSize: 20 }}>{b.kind === "car" ? "🚗" : b.kind === "obd" ? "📡" : b.kind === "adb" ? "📺" : "🔵"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{b.kind === "car" && b.sub ? b.sub : b.label}</Text>
                  <Muted>{b.connected ? "Подключено" : b.kind === "car" ? "Виртуальный автомобиль" : b.kind === "adb" ? "Магнитола с открытой отладкой" : b.kind === "obd" ? "Wi‑Fi адаптер OBD" : "Bluetooth"}</Muted>
                </View>
                <Text style={{ color: colors.accent }}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <View style={{ flexGrow: 1 }}><Button title="Искать снова" kind="ghost" onPress={() => void startRadar()} disabled={radarScanning} /></View>
          {view === "real" ? <View style={{ flexGrow: 1 }}><Button title="Найти Bluetooth" kind="ghost" onPress={() => void pickWebBle()} disabled={!ble.supported} /></View> : null}
          {view === "real" && serialSupported ? <View style={{ flexGrow: 1 }}><Button title="COM / USB" kind="ghost" onPress={() => void connectSerial()} /></View> : null}
          {view === "real" && bridge ? <View style={{ flexGrow: 1 }}><Button title="Настройки Bluetooth Windows" kind="ghost" onPress={() => void bridge.bluetooth.openSettings()} /></View> : null}
        </View>
        {view === "real" && blips.length === 0 && !radarScanning ? (
          <View style={{ gap: 4 }}>
            <Body style={{ fontWeight: "700" }}>Пока ничего не найдено. Что сделать:</Body>
            <Muted>1. Вставьте адаптер в разъём OBD под рулём и включите зажигание.</Muted>
            <Muted>2. Bluetooth-адаптер с поддержкой BLE (например OBDLink CX): «Найти Bluetooth». Обычный дешёвый ELM327 по Bluetooth: сначала свяжите его в «Настройки Bluetooth Windows» (пин-код чаще 1234 или 0000), затем «COM / USB».</Muted>
            <Muted>3. Для Wi‑Fi адаптера подключите компьютер к его сети и нажмите «Искать снова».</Muted>
          </View>
        ) : null}
        {bleError ? <Body style={{ color: colors.bad }}>{bleError}</Body> : null}
      </Card>
      ) : null}
      {view === "real" && !ready ? <RadioPanel active={focused} /> : null}
      <ActionSheet
        visible={!!sheet}
        title={sheet?.connected ? `✅ Подключено: ${sheet.label}` : sheet?.label ?? ""}
        subtitle={sheet?.connected ? "Подключено. Что сделать?" : sheet?.sub}
        actions={sheet ? sheetActions(sheet) : []}
        onClose={() => setSheet(null)}
      />

      {connection.status === "error" ? (
        <Card tone="bad">
          <Body style={{ fontWeight: "700" }}>Не удалось подключиться</Body>
          <Body style={{ color: colors.bad }}>{connection.message}</Body>
        </Card>
      ) : null}
      {connection.status === "connecting" ? (
        <Card>
          <Body style={{ fontWeight: "700" }}>Подключаюсь…</Body>
          <Muted>{connection.label}</Muted>
        </Card>
      ) : null}

      <VehicleZone />

      {!ready && view === "real" ? <Button title={showManual ? "Скрыть ручное подключение" : "Подключить вручную"} kind="ghost" onPress={() => setShowManual((v) => !v)} /> : null}

      {!ready && view === "real" && showManual ? (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(
              [
                ["ble", "Bluetooth"],
                ...(serialSupported ? ([["serial", "COM / USB"]] as const) : []),
                ["wifi", "Wi‑Fi"],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setMode(key)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: mode === key ? colors.accent : colors.card, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {mode === "ble" ? (
            <Card>
              <H2>Bluetooth LE</H2>
              {!ble.supported ? <Body style={{ color: colors.warn }}>Этот браузер не поддерживает Web Bluetooth. Откройте в Chrome/Edge или используйте приложение.</Body> : null}
              {Platform.OS === "web" ? (
                <Button title="Выбрать Bluetooth-устройство" onPress={() => void pickWebBle()} disabled={!ble.supported} />
              ) : (
                <>
                  <Button title={scanningBle ? "Поиск…" : "Найти адаптеры"} onPress={() => void startBleScan()} loading={scanningBle} />
                  {devices.map((d) => (
                    <Pressable key={d.id} onPress={() => void connectBle(d)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ color: colors.text, fontWeight: "600" }}>{d.name}</Text>
                      <Muted>{d.id}{d.rssi !== null ? ` · ${d.rssi} дБм` : ""}</Muted>
                    </Pressable>
                  ))}
                </>
              )}
              {bleError ? <Body style={{ color: colors.bad }}>{bleError}</Body> : null}
              <Muted>iPhone работает только с Bluetooth LE и Wi‑Fi адаптерами. Классические Bluetooth-адаптеры ELM327 работают только на Android.</Muted>
            </Card>
          ) : null}

          {mode === "serial" ? (
            <Card>
              <H2>COM-порт (USB или Bluetooth)</H2>
              <Muted>Подходит для USB-кабелей ELM327 и для Bluetooth-адаптеров, спаренных в Windows (они появляются как COM-порт). Скорость порта подбирается автоматически.</Muted>
              <Button title="Выбрать порт" onPress={() => void connectSerial()} loading={connection.status === "connecting"} />
              {bleError ? <Body style={{ color: colors.bad }}>{bleError}</Body> : null}
            </Card>
          ) : null}

          {mode === "wifi" ? (
            <Card>
              <H2>Wi‑Fi адаптер</H2>
              <Muted>Сначала подключите телефон к Wi‑Fi сети адаптера (обычно «WiFi_OBDII» или «V-LINK»), затем нажмите «Подключиться».</Muted>
              <Field label="Адрес" value={host} onChangeText={setHost} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
              <Field label="Порт" value={port} onChangeText={setPort} keyboardType="number-pad" />
              <Button title="Подключиться" onPress={() => void connectWifi()} disabled={!wifiSupported} loading={connection.status === "connecting"} />
              {!wifiSupported ? <Body style={{ color: colors.warn }}>В браузере Wi‑Fi адаптеры недоступны: нужен телефон.</Body> : null}
              {bleError ? <Body style={{ color: colors.bad }}>{bleError}</Body> : null}
            </Card>
          ) : null}
        </>
      ) : null}

      {settings.hadRealScan || view === "demo" ? null : (
      <Card>
        <H2>Какой адаптер взять</H2>
        <Muted>• Только для диагностики (ошибки, данные): подойдёт обычный ELM327. Дешёвые клоны иногда зависают.</Muted>
        <Muted>• Для записи прошивки нужен адаптер на чипе STN, например OBDLink CX или MX+. Через обычный ELM327 приложение прошивать не будет.</Muted>
      </Card>
      )}
      {!ready && view === "real" ? (
        <Card>
          <H2>Способы подключения</H2>
          <Body style={{ fontWeight: "700" }}>🔵 Bluetooth</Body>
          <Muted>Адаптер OBD: прошивка и диагностика (BLE находится кнопкой «Найти Bluetooth», обычный ELM327 сначала связывается в Windows и подключается как COM). Файл .apk можно отправить на магнитолу мастером Windows.</Muted>
          <Body style={{ fontWeight: "700" }}>📶 Wi‑Fi</Body>
          <Muted>Wi‑Fi адаптер OBD: диагностика и прошивка. Магнитола с отладкой: приложения и русификация (ADB).</Muted>
          <Body style={{ fontWeight: "700" }}>🔌 USB-кабель</Body>
          <Muted>USB-адаптер OBD (COM): диагностика и прошивка. Магнитола по USB-кабелю с отладкой: приложения и русификация. Флешка: файл обновления для штатной магнитолы.</Muted>
          <Body style={{ fontWeight: "700" }}>🔧 OBD-сканер</Body>
          <Muted>Адаптеры на чипах ELM327 и STN поддерживаются (STN нужен для записи). Профессиональные сканеры с интерфейсом J2534 (Autel, Launch, Tactrix) пока не поддерживаются.</Muted>
          {j2534.length > 0 ? <Muted>В Windows установлены драйверы J2534: {j2534.map((d) => d.name).join(", ")}. Подключиться к ним приложение пока не может: драйверы чаще 32-разрядные и нужен отдельный посредник.</Muted> : null}
        </Card>
      ) : null}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: "600" }}>Определять модель по VIN через интернет</Body>
            <Muted>Если включено, VIN автомобиля отправляется в открытую базу NHTSA (США), чтобы узнать модель. Если выключено, модель определяется только по самому VIN без интернета, данных наружу не уходит.</Muted>
          </View>
          <Switch testID="switch-online-vin" value={settings.onlineVin !== false} onValueChange={(v) => store.updateSettings({ onlineVin: v })} trackColor={{ true: colors.accent }} />
        </View>
      </Card>
      <LiveMonitor mode={view} active={focused} />
    </Screen>
  );
}


const KIND_TEXT = {
  ble: "Bluetooth LE",
  webbluetooth: "Bluetooth (компьютер)",
  wifi: "Wi‑Fi",
  serial: "COM-порт / USB",
  demo: "Демо (виртуальный адаптер)",
} as const;

const BUS_TEXT = { can11: "CAN 11 бит", can29: "CAN 29 бит", kline: "K-Line", j1850: "J1850", unknown: "не определена" } as const;

/** Зона «Подключённый автомобиль»: какое авто определено и через что именно подключились. */
function VehicleZone() {
  const { connection, liveScan, scanning, progress } = useSession();
  const store = useStore();
  const ready = connection.status === "ready";

  if (!ready) {
    return (
      <Card>
        <H2>Подключённый автомобиль</H2>
        <Muted>Подключитесь к адаптеру: автомобиль определится сам, и здесь появятся его данные и способ подключения.</Muted>
        <Muted>Без адаптера связаться с блоками автомобиля нельзя: сам телефон или компьютер по Bluetooth к блокам не подключается, для этого нужен маленький Bluetooth-адаптер в разъёме OBD. Пока его нет, во вкладке 3 можно выбрать файлы и подготовить их: они встанут в очередь и предложатся при первом подключении.</Muted>
      </Card>
    );
  }
  if (!liveScan) {
    return (
      <Card>
        <H2>Подключённый автомобиль</H2>
        <Body>Определяю автомобиль…</Body>
        <Progress fraction={progress?.fraction ?? 0.02} label={progress?.step ?? (scanning ? "Подготовка" : "Ожидание")} />
      </Card>
    );
  }

  const info = liveScan.vinOnline;
  const ids = new Set(matchScannedCar(info?.make ?? liveScan.vinInfo?.make, info?.model, resolveModelYear(liveScan.vinInfo, info)).map((c) => c.id));
  const waiting = store.data.queue.filter((q) => ids.has(q.carId));
  return (
    <Card tone="good">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <H2>Подключённый автомобиль</H2>
        <Badge tone={liveScan.adapter.isStn ? "good" : "warn"} text={liveScan.adapter.isStn ? "Прошивка возможна" : "Только диагностика"} />
      </View>
      <Body style={{ fontSize: 20, fontWeight: "800" }}>{vehicleTitle(liveScan)}</Body>
      <Row label="VIN" value={liveScan.vin} mono />
      <Row label="Модельный год" value={resolveModelYear(liveScan.vinInfo, liveScan.vinOnline)} />
      <Row label="Двигатель" value={[info?.displacementL ? `${info.displacementL} л` : null, info?.fuel].filter(Boolean).join(" · ")} />
      <Row label="Подключено через" value={KIND_TEXT[connection.kind]} />
      <Row label="Устройство" value={connection.label} />
      <Row label="Адаптер (чип)" value={liveScan.adapter.chip} />
      <Row label="Шина автомобиля" value={BUS_TEXT[liveScan.adapter.bus]} />
      <Row label="Напряжение бортсети" value={liveScan.adapter.voltage !== null ? `${liveScan.adapter.voltage.toFixed(1)} В` : null} />
      <Row label="Блоков управления" value={liveScan.ecus.length} />
      <Row label="Ошибок" value={liveScan.dtcs.length} />
      {!liveScan.adapter.isStn ? <Muted>Этот адаптер не умеет отправлять длинные сообщения, поэтому устанавливать прошивки через него нельзя. Для прошивки нужен адаптер на чипе STN (например OBDLink CX или MX+).</Muted> : null}
      {waiting.length > 0 ? (
        <>
          <Body style={{ fontWeight: "700" }}>Ждут установки в этот автомобиль ({waiting.length})</Body>
          {waiting.map((q) => <Muted key={q.id}>• {q.title}</Muted>)}
        </>
      ) : null}
    </Card>
  );
}

/** Крупный блок после подключения: подключение удалось, в какую машину и что можно установить. */
function ConnectedHero({ onGo }: { onGo: (path: string, params?: Record<string, string>) => void }) {
  const { connection, liveScan, scanning, progress, scanError, runScan, disconnect } = useSession();
  if (connection.status !== "ready") return null;
  const demo = connection.kind === "demo";
  const title = liveScan ? vehicleTitle(liveScan) : null;
  return (
    <Card tone="good">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Body style={{ fontWeight: "800", fontSize: 18, flex: 1 }}>✅ Подключение удалось</Body>
        <Badge tone={demo ? "warn" : "good"} text={demo ? "Демо" : "Реальный адаптер"} />
      </View>
      <Muted>Подключено через: {connection.label}</Muted>
      {scanError ? <Body style={{ color: colors.bad }}>{scanError}</Body> : null}
      {title ? (
        <>
          <Body style={{ fontSize: 17, fontWeight: "700" }}>Автомобиль: {title}</Body>
          <Body style={{ fontWeight: "700" }}>Что установить в эту машину?</Body>
          <Button title="🔧 Прошивка блоков" onPress={() => onGo("/cars", { section: "blocks" })} />
          <Button title="🇷🇺 Русификация" kind="ghost" onPress={() => onGo("/cars/task", { kind: "russify" })} />
          <Button title="📱 Установка приложений" kind="ghost" onPress={() => onGo("/cars/task", { kind: "apps" })} />
        </>
      ) : (
        <>
          <Body>Определяю автомобиль…</Body>
          <Progress fraction={progress?.fraction ?? 0.05} label={progress?.step ?? (scanning ? "Идёт определение" : "Ожидание")} />
        </>
      )}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flexGrow: 1 }}><Button title="Определить заново" kind="ghost" onPress={() => void runScan()} loading={scanning} /></View>
        <View style={{ flexGrow: 1 }}><Button title="Отключиться" kind="ghost" onPress={() => void disconnect()} disabled={scanning} /></View>
      </View>
    </Card>
  );
}
