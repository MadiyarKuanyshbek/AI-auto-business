import { useCallback, useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { logEvent, useLiveEvents, liveSnapshot } from "../liveLog";
import { useSession } from "../session";
import { desktopBridge } from "../transport/desktop";
import { Badge, Body, Button, Card, H2, Muted, colors } from "./kit";

type RadioState = { kind: "Bluetooth" | "WiFi"; state: string };
const LABEL = { Bluetooth: "Bluetooth компьютера", WiFi: "Wi‑Fi компьютера" } as const;

/** Включение и выключение Bluetooth и Wi‑Fi компьютера прямо из приложения (Windows). */
export function RadioPanel({ active = true }: { active?: boolean }) {
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

  // Состояние читаем, только пока вкладка открыта: каждый запрос запускает PowerShell.
  useEffect(() => {
    if (!bridge || !active) return;
    const first = setTimeout(() => void refresh(), 200);
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [bridge, refresh, active]);

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
export function LiveMonitor({ mode, active = true }: { mode: "real" | "demo"; active?: boolean }) {
  const { connection, exchangeLog, scanning, progress } = useSession();
  const events = useLiveEvents().filter((e) => e.real === (mode === "real"));
  const [, force] = useState(0);
  const [open, setOpen] = useState(true);
  const [savedLog, setSavedLog] = useState<string | null>(null);

  // Обмен с адаптером копится в самом адаптере, поэтому обновляем экран по таймеру.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => force((n) => n + 1), 700);
    return () => clearInterval(t);
  }, [active]);

  const connected = connection.status === "ready";
  const log = connected && (connection.kind === "demo") === (mode === "demo") ? exchangeLog().slice(-14) : [];

  /** Полный журнал событий и обмена с адаптером в файл: пригодится, если на настоящей машине что-то пошло не так. */
  async function saveSupportLog() {
    const bridge = desktopBridge();
    if (!bridge) return;
    const all = liveSnapshot();
    const lines = [
      `Режим: ${mode}`,
      `Подключение: ${stateText}`,
      "",
      "== События ==",
      ...all.events.map((e) => `${new Date(e.t).toISOString()}  ${e.real ? "" : "[демо] "}${e.text}`),
      "",
      "== Обмен с адаптером ==",
      ...exchangeLog().map((l) => `${new Date(l.t).toISOString()} ${l.dir === "tx" ? "→" : "←"} ${l.text.replace(/\s+/g, " ")}`),
    ];
    setSavedLog(await bridge.files.exportLog(lines.join("\n")));
  }
  const real = mode === "real";
  const stateText =
    connection.status === "ready" ? `Подключено: ${connection.label}` : connection.status === "connecting" ? `Подключаюсь: ${connection.label}` : connection.status === "error" ? connection.message : "Не подключено";

  return (
    <Card tone={real ? (connected ? "good" : undefined) : "warn"}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <H2>{real ? "Что происходит сейчас: реальный режим" : "Что происходит сейчас: демо"}</H2>
        <Badge tone={real ? "good" : "warn"} text={real ? (connected ? "Реальный адаптер" : "Реальный режим") : "Демо"} />
      </Pressable>
      {open ? (
        <>
          <Body>{stateText}</Body>
          {scanning ? <Muted>Определяю автомобиль: {progress?.step ?? "…"}</Muted> : null}
          <Muted style={{ fontWeight: "700" }}>События</Muted>
          {events.length === 0 ? <Muted>Пока ничего.</Muted> : null}
          {events.slice(-8).reverse().map((e, i) => (
            <Text key={`${e.t}-${i}`} style={{ color: colors.text, fontSize: 12 }}>
              {new Date(e.t).toLocaleTimeString("ru-RU")}  {e.text}
            </Text>
          ))}
          <Muted style={{ fontWeight: "700" }}>{real ? "Обмен с адаптером" : "Обмен с виртуальным адаптером"}</Muted>
          {log.length === 0 ? <Muted>Обмена нет: адаптер не подключён.</Muted> : null}
          {log.map((l, i) => (
            <Text key={`${l.t}-${i}`} style={{ color: colors.muted, fontFamily: "monospace", fontSize: 11 }}>
              {l.dir === "tx" ? "→" : "←"} {l.text.replace(/\s+/g, " ").slice(0, 120)}
            </Text>
          ))}
          {desktopBridge() ? (
            <>
              <Button title="Сохранить журнал для поддержки" kind="ghost" onPress={() => void saveSupportLog()} />
              {savedLog ? <Muted>Журнал сохранён: {savedLog}. Его можно отправить разработчику, если что-то не работает (в нём есть VIN и команды адаптера).</Muted> : null}
            </>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
