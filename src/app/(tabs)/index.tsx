import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
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

type Mode = "demo" | "ble" | "serial" | "wifi";

export default function ConnectScreen() {
  const router = useRouter();
  const session = useSession();
  const { settings } = useStore().data;
  const { connection } = session;
  const [mode, setMode] = useState<Mode>(settings.showDemo ? "demo" : "ble");
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
  const [showManual, setShowManual] = useState(false);
  const [radarScanning, setRadarScanning] = useState(false);
  const [found, setFound] = useState<Blip[]>([]);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Blip | null>(null);
  const bridge = desktopBridge();

  // Радар: сначала появляются демо-автомобили, затем устройства, найденные в сети.
  const startRadar = useCallback(async () => {
    setRadarScanning(true);
    setFound([]);
    logEvent("Радар: ищу устройства в сети…");
    const add = (b: Blip) => setFound((l) => (l.some((x) => x.id === b.id) ? l : [...l, b]));
    if (settings.showDemo) {
      DEMO_VEHICLES.forEach((v, i) => setTimeout(() => add({ id: `demo-${i}`, kind: "car", label: v.label, sub: "Демо" }), 500 + i * 450));
    }
    try {
      const list = (await bridge?.net.scan()) ?? [];
      for (const d of list) {
        if (d.port === 5555) add({ id: `adb-${d.ip}:${d.port}`, kind: "adb", label: `Магнитола ${d.ip}`, sub: "ADB" });
        else add({ id: `obd-${d.ip}:${d.port}`, kind: "obd", label: `Wi‑Fi адаптер ${d.ip}`, sub: `порт ${d.port}` });
        logEvent(`Радар: найдено ${d.port === 5555 ? "устройство Android (ADB)" : "Wi‑Fi адаптер OBD"} ${d.ip}:${d.port}`);
      }
      if (list.length === 0) logEvent("Радар: устройств в сети не найдено (Wi‑Fi адаптеры и магнитолы)");
    } catch {
      // Сеть недоступна: остаются демо-автомобили и ручное подключение.
    }
    setTimeout(() => setRadarScanning(false), 1200);
  }, [bridge, settings.showDemo]);

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
    if (offered.current === (liveScan.vin ?? "no-vin")) return;
    offered.current = liveScan.vin ?? "no-vin";
    logEvent(`Автомобиль определён: ${vehicleTitle(liveScan)}`, connection.kind !== "demo");
    const t = setTimeout(() => setSheet({ id: "connected", kind: "car", label: vehicleTitle(liveScan), sub: "Подключено", connected: true }), 400);
    return () => clearTimeout(t);
  }, [liveScan, connection]);

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
        { title: "Прошивки и обновления", hint: "Блоки автомобиля и доступные пакеты", onPress: go("/cars") },
        { title: "Интерфейс и экраны", hint: "Как будет выглядеть салон, файлы интерфейса", kind: "ghost", onPress: go("/interface") },
        { title: "Приложения и русификация", hint: "Установка приложений на магнитолу по Wi‑Fi", kind: "ghost", onPress: go("/cars/apps") },
        { title: "Отключиться", kind: "ghost", onPress: () => { setSheet(null); void session.disconnect(); } },
      ];
    }
    if (b.kind === "adb") {
      const address = b.id.slice(4);
      return [
        { title: "Установить приложения", hint: "Яндекс Навигатор, 2ГИС, VLC и другие", onPress: go("/cars/apps", { address }) },
        { title: "Русификация: выбор языка", hint: "Откроет выбор языка на экране магнитолы", kind: "ghost", onPress: go("/cars/apps", { address, action: "locale" }) },
        { title: "Настройки магнитолы", kind: "ghost", onPress: go("/cars/apps", { address, action: "settings" }) },
      ];
    }
    if (b.kind === "obd") return [{ title: "Подключиться к адаптеру", hint: "Автомобиль определится сам", onPress: () => void sheetConnect(b) }];
    return [{ title: "Подключиться и определить авто", hint: "Виртуальный автомобиль для показа и проверки", onPress: () => void sheetConnect(b) }];
  }

  return (
    <Screen>
      <H1>AutoFlash</H1>
      <Muted>Радар ищет автомобили и устройства рядом. Нажмите на найденное, чтобы подключиться или выбрать, что установить.</Muted>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <H2>Радар</H2>
          <Badge tone={radarScanning ? "accent" : "muted"} text={radarScanning ? "Поиск…" : `Найдено: ${blips.length}`} />
        </View>
        <Radar blips={blips} scanning={radarScanning} onPick={setSheet} />
        <Muted>🚗 автомобили · 📡 Wi‑Fi адаптеры OBD · 📺 магнитолы · 🔵 Bluetooth</Muted>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <View style={{ flexGrow: 1 }}><Button title="Искать снова" kind="ghost" onPress={() => void startRadar()} disabled={radarScanning} /></View>
          <View style={{ flexGrow: 1 }}><Button title="Найти Bluetooth" kind="ghost" onPress={() => void pickWebBle()} disabled={!ble.supported} /></View>
          {serialSupported ? <View style={{ flexGrow: 1 }}><Button title="COM / USB" kind="ghost" onPress={() => void connectSerial()} /></View> : null}
        </View>
        {bleError ? <Body style={{ color: colors.bad }}>{bleError}</Body> : null}
      </Card>
      <RadioPanel />
      <ActionSheet
        visible={!!sheet}
        title={sheet?.label ?? ""}
        subtitle={sheet?.connected ? "Подключено. Что сделать?" : sheet?.sub}
        actions={sheet ? sheetActions(sheet) : []}
        onClose={() => setSheet(null)}
      />

      <Card tone={ready ? "good" : connection.status === "error" ? "bad" : undefined}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <H2>Адаптер</H2>
          {ready ? <Badge tone="good" text="Подключён" /> : connection.status === "connecting" ? <Badge tone="accent" text="Подключение…" /> : <Badge text="Не подключён" />}
        </View>
        {ready ? <Body>{connection.label}</Body> : null}
        {connection.status === "error" ? <Body style={{ color: colors.bad }}>{connection.message}</Body> : null}
        {ready ? (
          <>
            {session.scanError ? <Body style={{ color: colors.bad }}>{session.scanError}</Body> : null}
            <Button title="Определить автомобиль заново" kind="ghost" onPress={scan} loading={session.scanning} />
            <Button title="Отключиться" kind="ghost" onPress={() => void session.disconnect()} disabled={session.scanning} />
          </>
        ) : null}
      </Card>

      <VehicleZone onOpen={() => router.push("/cars")} />

      {!ready ? <Button title={showManual ? "Скрыть ручное подключение" : "Подключить вручную"} kind="ghost" onPress={() => setShowManual((v) => !v)} /> : null}

      {!ready && showManual ? (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(
              [
                ...(settings.showDemo ? ([["demo", "Демо"]] as const) : []),
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

          {mode === "demo" && settings.showDemo ? (
            <Card>
              <H2>Демо-режим</H2>
              <Muted>Виртуальные автомобили с настоящим протоколом обмена, без железа. Подходит, чтобы показать приложение клиенту.</Muted>
              {DEMO_VEHICLES.map((v, i) => (
                <Button key={v.label} title={v.label} kind="ghost" onPress={() => void session.connectDemo(i)} loading={connection.status === "connecting"} />
              ))}
            </Card>
          ) : null}

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

      {settings.hadRealScan ? null : (
      <Card>
        <H2>Какой адаптер взять</H2>
        <Muted>• Для диагностики: OBDLink CX/MX+, Vgate iCar Pro BLE, vLinker MC+/BM+.</Muted>
        <Muted>• Дешёвые клоны ELM327 v2.1 часто зависают и теряют данные, на них возможны ошибки идентификации.</Muted>
        <Muted>• Для прошивки блоков нужен отдельный интерфейс (J2534 или профильный программатор): ELM327 для записи не подходит.</Muted>
      </Card>
      )}
      <LiveMonitor />
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
function VehicleZone({ onOpen }: { onOpen: () => void }) {
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
      <Button title="Открыть авто и прошивки" onPress={onOpen} />
    </Card>
  );
}
