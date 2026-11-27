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
  const params = useLocalSearchParams<{ address?: string; action?: string }>();
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
      if (autoConnect && list.length === 1) await connectTo(`${list[0].ip}:${list[0].port}`);
    },
    [bridge, connectTo],
  );

  // При открытии: если пришли с радара, подключаемся по переданному адресу, иначе сами ищем магнитолу в сети.
  const started = useRef<string | null>(null);
  useEffect(() => {
    const key = `${params.address ?? ""}|${params.action ?? ""}`;
    if (!bridge || started.current === key) return;
    started.current = key;
    const t = setTimeout(() => {
      void refresh();
      if (params.address) void connectTo(params.address, params.action);
      else void findHeadUnits(true);
    }, 150);
    return () => clearTimeout(t);
  }, [bridge, params.address, params.action, refresh, connectTo, findHeadUnits]);

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
        {serial ? <Muted>Магнитола: {serial}. Ниже выберите, что установить.</Muted> : null}
        {demo ? <Muted>В демо-режиме приложения на магнитолу не ставятся: нужна настоящая магнитола в вашей Wi‑Fi сети.</Muted> : null}
        {message ? <Badge tone={message.ok ? "good" : "bad"} text={message.text} /> : null}

        {!serial ? (
          <>
            <Muted>Ноутбук и магнитола должны быть в одной Wi‑Fi сети (например, в точке доступа телефона). На магнитоле должна быть включена «Отладка по Wi‑Fi».</Muted>
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
