import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { DEMO_VEHICLES } from "../../core/sim/vehicles";
import { useSession } from "../../session";
import { ble } from "../../transport/ble";
import type { BleDeviceInfo } from "../../transport/types";
import { pickSerialTransport, serialSupported } from "../../transport/serial";
import { createWifiTransport, wifiSupported } from "../../transport/wifi";
import { Badge, Body, Button, Card, Field, H1, H2, Muted, Progress, Screen, colors } from "../../ui/kit";

type Mode = "demo" | "ble" | "serial" | "wifi";

export default function ConnectScreen() {
  const router = useRouter();
  const session = useSession();
  const { connection } = session;
  const [mode, setMode] = useState<Mode>("demo");
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
    const result = await session.runScan();
    if (result) router.push("/vehicle");
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
            <Button title={session.scanning ? "Сканирование…" : "Сканировать автомобиль"} onPress={scan} loading={session.scanning} />
            {session.progress ? <Progress fraction={session.progress.fraction} label={session.progress.step} /> : null}
            {session.scanError ? <Body style={{ color: colors.bad }}>{session.scanError}</Body> : null}
            <Button title="Отключиться" kind="ghost" onPress={() => void session.disconnect()} disabled={session.scanning} />
          </>
        ) : null}
      </Card>

      {!ready ? (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(
              [
                ["demo", "Демо"],
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

          {mode === "demo" ? (
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

      <Card>
        <H2>Какой адаптер взять</H2>
        <Muted>• Для диагностики: OBDLink CX/MX+, Vgate iCar Pro BLE, vLinker MC+/BM+.</Muted>
        <Muted>• Дешёвые клоны ELM327 v2.1 часто зависают и теряют данные, на них возможны ошибки идентификации.</Muted>
        <Muted>• Для прошивки блоков нужен отдельный интерфейс (J2534 или профильный программатор): ELM327 для записи не подходит.</Muted>
      </Card>
    </Screen>
  );
}
