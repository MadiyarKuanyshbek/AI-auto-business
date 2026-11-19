import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { DEMO_VEHICLES } from "../../core/sim/vehicles";
import { useSession } from "../../session";
import { useStore } from "../../storage/store";
import { ble } from "../../transport/ble";
import type { BleDeviceInfo } from "../../transport/types";
import { pickSerialTransport, serialSupported } from "../../transport/serial";
import { createWifiTransport, wifiSupported } from "../../transport/wifi";
import { vehicleTitle } from "../../storage/model";
import { resolveModelYear } from "../../core/vin";
import { Badge, Body, Button, Card, Field, H1, H2, Muted, Progress, Row, Screen, colors } from "../../ui/kit";

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

  return (
    <Screen>
      <H1>AutoFlash</H1>
      <Muted>Подключитесь к OBD-адаптеру в авто: приложение само определит автомобиль, блоки и версии прошивок.</Muted>

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

      {!ready ? (
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
      <ExchangeLog />
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
  const ready = connection.status === "ready";

  if (!ready) {
    return (
      <Card>
        <H2>Подключённый автомобиль</H2>
        <Muted>Подключитесь к адаптеру: автомобиль определится сам, и здесь появятся его данные и способ подключения.</Muted>
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
      <Button title="Открыть авто и прошивки" onPress={onOpen} />
    </Card>
  );
}

/** Журнал обмена с адаптером — нужен, чтобы разбираться с проблемами подключения. */
function ExchangeLog() {
  const { exchangeLog, connection } = useSession();
  const [show, setShow] = useState(false);
  const log = exchangeLog();
  return (
    <Card>
      <H2>Журнал обмена с адаптером</H2>
      <Muted>Подключение: {connection.status === "ready" ? connection.label : connection.status}</Muted>
      <Button title={show ? "Скрыть" : `Показать (${log.length})`} kind="ghost" onPress={() => setShow((v) => !v)} />
      {show
        ? log.slice(-80).map((l, i) => (
            <Muted key={i} style={{ fontFamily: "monospace", fontSize: 11 }}>
              {l.dir === "tx" ? "→" : "←"} {l.text.replace(/\s+/g, " ").slice(0, 160)}
            </Muted>
          ))
        : null}
    </Card>
  );
}
