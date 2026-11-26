import { useCallback, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { LANGUAGE_HINT, RECOMMENDED_APPS, explainAdbError, parseAddress, parseDevices, parsePackages, type AdbDevice } from "../../../core/adb";
import { desktopBridge } from "../../../transport/desktop";
import { Badge, Body, Button, Card, Field, H2, Muted, Screen, colors } from "../../../ui/kit";

/** Установка приложений и русификация магнитолы по Wi-Fi (ADB). Только в настольной программе. */
export default function AppsScreen() {
  const bridge = desktopBridge();
  const [address, setAddress] = useState("");
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [serial, setSerial] = useState<string | null>(null);
  const [packages, setPackages] = useState<string[]>([]);
  const [apk, setApk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const note = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString("ru-RU")} ${line}`, ...l].slice(0, 30));

  const refresh = useCallback(async () => {
    if (!bridge) return;
    const r = await bridge.adb.run({ op: "devices" });
    const list = parseDevices(r.out);
    setDevices(list);
    setSerial((cur) => (cur && list.some((d) => d.id === cur && d.state === "device") ? cur : list.find((d) => d.state === "device")?.id ?? null));
  }, [bridge]);

  async function connect() {
    if (!bridge) return;
    const a = parseAddress(address);
    if (!a.ok) return setMessage({ ok: false, text: a.error });
    setBusy(true);
    setMessage(null);
    const r = await bridge.adb.run({ op: "connect", address: a.address });
    setBusy(false);
    note(`Подключение ${a.address}: ${r.ok ? "успешно" : "ошибка"}`);
    if (!r.ok) setMessage({ ok: false, text: explainAdbError(r.out) });
    else setMessage({ ok: true, text: `Подключено: ${a.address}` });
    await refresh();
  }

  async function loadPackages(id = serial) {
    if (!bridge || !id) return;
    const r = await bridge.adb.run({ op: "packages", serial: id });
    if (!r.ok) return setMessage({ ok: false, text: explainAdbError(r.out) });
    setPackages(parsePackages(r.out));
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
    if (done) {
      setMessage({ ok: true, text: `Установлено: ${apk}` });
      await loadPackages();
    } else setMessage({ ok: false, text: explainAdbError(r.out) });
  }

  async function uninstall(pkg: string) {
    if (!bridge || !serial) return;
    const r = await bridge.adb.run({ op: "uninstall", serial, pkg });
    note(`Удаление ${pkg}: ${r.ok ? "успешно" : "ошибка"}`);
    if (!r.ok) setMessage({ ok: false, text: explainAdbError(r.out) });
    await loadPackages();
  }

  if (!bridge) {
    return (
      <Screen>
        <H2>Установка приложений по Wi-Fi</H2>
        <Card>
          <Body>Этот раздел работает только в настольной программе AutoFlash для Windows.</Body>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <H2>Установка приложений и русификация</H2>
      <Muted>
        Ноутбук и магнитола должны быть в одной Wi-Fi сети. На магнитоле включите «Отладка по Wi-Fi» (меню разработчика), узнайте её IP-адрес и введите здесь. Если магнитола закрыта производителем, подключиться не получится: тогда нужен внешний Android-бокс.
      </Muted>

      <Card>
        <Body style={{ fontWeight: "700" }}>1. Подключение</Body>
        <Field label="Адрес магнитолы" value={address} onChangeText={setAddress} placeholder="192.168.1.50 или 192.168.1.50:5555" autoCapitalize="none" />
        <Button title={busy ? "Подключаюсь…" : "Подключиться"} disabled={busy} onPress={() => void connect()} />
        <Button title="Обновить список устройств" kind="ghost" onPress={() => void refresh()} />
        {devices.length === 0 ? <Muted>Устройств пока нет.</Muted> : null}
        {devices.map((d) => (
          <Pressable
            key={d.id}
            onPress={() => {
              if (d.state === "device") {
                setSerial(d.id);
                void loadPackages(d.id);
              }
            }}
          >
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Badge tone={d.state === "device" ? "good" : "warn"} text={d.state === "device" ? "Готово" : d.state === "unauthorized" ? "Нужно разрешение на экране" : d.state} />
              <Text style={{ color: serial === d.id ? colors.accent : colors.text, fontFamily: "monospace" }}>{d.id}</Text>
            </View>
          </Pressable>
        ))}
        {message ? <Badge tone={message.ok ? "good" : "bad"} text={message.text} /> : null}
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>2. Установить приложение</Body>
        <Button title={apk ? `Файл: ${apk}` : "Выбрать файл .apk"} kind="ghost" onPress={() => void pick()} />
        <Button title="Установить на магнитолу" disabled={busy || !serial || !apk} onPress={() => void install()} />
        {!serial ? <Muted>Сначала подключитесь к магнитоле.</Muted> : null}
        <Muted>Берите приложения только у разработчика или в официальном магазине. Чужие сборки могут содержать вредоносный код.</Muted>
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>3. Установленные приложения</Body>
        <Button title="Показать список" kind="ghost" disabled={!serial} onPress={() => void loadPackages()} />
        {packages.map((p) => (
          <View key={p} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.text, fontFamily: "monospace", fontSize: 12, flex: 1 }}>{p}</Text>
            <Pressable onPress={() => void uninstall(p)}>
              <Text style={{ color: colors.bad, fontSize: 13 }}>Удалить</Text>
            </Pressable>
          </View>
        ))}
        <Button title="Перезагрузить магнитолу" kind="ghost" disabled={!serial} onPress={() => void (serial && bridge.adb.run({ op: "reboot", serial }))} />
      </Card>

      <H2>Русификация: что обычно ставят</H2>
      <Card>
        <Muted>{LANGUAGE_HINT}</Muted>
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
          {log.map((l) => (
            <Muted key={l}>{l}</Muted>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
