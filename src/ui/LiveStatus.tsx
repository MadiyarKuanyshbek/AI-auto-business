import { useCallback, useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { logEvent, useLiveEvents } from "../liveLog";
import { useSession } from "../session";
import { desktopBridge } from "../transport/desktop";
import { Badge, Body, Card, H2, Muted, colors } from "./kit";

type RadioState = { kind: "Bluetooth" | "WiFi"; state: string };
const LABEL = { Bluetooth: "Bluetooth компьютера", WiFi: "Wi‑Fi компьютера" } as const;

/** Включение и выключение Bluetooth и Wi‑Fi компьютера прямо из приложения (Windows). */
export function RadioPanel() {
  const bridge = desktopBridge();
  const [radios, setRadios] = useState<RadioState[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!bridge) return;
    const r = await bridge.radio.get();
    if (r.ok) {
      setRadios(r.radios);
      setError(null);
    } else setError(r.error ?? "Не удалось прочитать состояние");
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    const first = setTimeout(() => void refresh(), 200);
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [bridge, refresh]);

  async function toggle(kind: RadioState["kind"], on: boolean) {
    if (!bridge) return;
    setBusy(kind);
    logEvent(`${LABEL[kind]}: ${on ? "включаю" : "выключаю"}…`);
    const r = await bridge.radio.set(kind, on);
    setBusy(null);
    if (r.ok) {
      setRadios(r.radios);
      setError(null);
      logEvent(`${LABEL[kind]}: ${r.radios.find((x) => x.kind === kind)?.state === "On" ? "включён" : "выключен"}`);
    } else {
      setError(r.error ?? "Не удалось переключить");
      logEvent(`${LABEL[kind]}: ошибка переключения`);
    }
  }

  if (!bridge) return null;

  return (
    <Card>
      <H2>Связь компьютера</H2>
      {radios === null ? <Muted>{error ?? "Читаю состояние…"}</Muted> : null}
      {radios?.map((r) => (
        <View key={r.kind} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: "600" }}>{LABEL[r.kind]}</Body>
            <Muted>{r.state === "On" ? "Включён" : r.state === "Off" ? "Выключен" : r.state}</Muted>
          </View>
          <Switch testID={`radio-${r.kind}`} value={r.state === "On"} disabled={busy !== null} onValueChange={(v) => void toggle(r.kind, v)} trackColor={{ true: colors.accent }} />
        </View>
      ))}
      {radios && !radios.some((r) => r.kind === "Bluetooth") ? <Muted>Bluetooth в этом компьютере не найден.</Muted> : null}
      {error && radios ? <Muted style={{ color: colors.bad }}>{error}</Muted> : null}
      <Muted>Выключение Wi‑Fi отключит интернет на этом компьютере. Для поиска адаптеров по Bluetooth и Wi‑Fi модули должны быть включены.</Muted>
    </Card>
  );
}

/** Что происходит прямо сейчас: подключение, радар, связь и обмен с адаптером в реальном времени. */
export function LiveMonitor() {
  const { connection, exchangeLog, scanning, progress } = useSession();
  const events = useLiveEvents();
  const [, force] = useState(0);
  const [open, setOpen] = useState(true);

  // Обмен с адаптером копится в самом адаптере, поэтому обновляем экран по таймеру.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 700);
    return () => clearInterval(t);
  }, []);

  const log = exchangeLog().slice(-14);
  const real = connection.status === "ready" && connection.kind !== "demo";
  const stateText =
    connection.status === "ready" ? `Подключено: ${connection.label}` : connection.status === "connecting" ? `Подключаюсь: ${connection.label}` : connection.status === "error" ? connection.message : "Не подключено";

  return (
    <Card tone={real ? "good" : undefined}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <H2>Что происходит сейчас</H2>
        <Badge tone={real ? "good" : connection.status === "ready" ? "warn" : "muted"} text={real ? "Реальный адаптер" : connection.status === "ready" ? "Демо" : open ? "Скрыть" : "Показать"} />
      </Pressable>
      {open ? (
        <>
          <Body>{stateText}</Body>
          {scanning ? <Muted>Определяю автомобиль: {progress?.step ?? "…"}</Muted> : null}
          <Muted style={{ fontWeight: "700" }}>События</Muted>
          {events.length === 0 ? <Muted>Пока ничего.</Muted> : null}
          {events.slice(-8).reverse().map((e) => (
            <Text key={e.t + e.text} style={{ color: colors.text, fontSize: 12 }}>
              {new Date(e.t).toLocaleTimeString("ru-RU")}  {e.text}
            </Text>
          ))}
          <Muted style={{ fontWeight: "700" }}>Обмен с адаптером{real ? "" : connection.status === "ready" ? " (виртуальный)" : ""}</Muted>
          {log.length === 0 ? <Muted>Обмена нет: адаптер не подключён.</Muted> : null}
          {log.map((l, i) => (
            <Text key={`${l.t}-${i}`} style={{ color: colors.muted, fontFamily: "monospace", fontSize: 11 }}>
              {l.dir === "tx" ? "→" : "←"} {l.text.replace(/\s+/g, " ").slice(0, 120)}
            </Text>
          ))}
        </>
      ) : null}
    </Card>
  );
}
