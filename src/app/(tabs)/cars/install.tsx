import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { LEGAL_NOTICE } from "../../../core/catalog";
import { installChecks, installPackage, readBackup, restoreBackup, type InstallOutcome, type InstallRequest } from "../../../core/install";
import { sha256Hex } from "../../../core/sha256";
import { useSession } from "../../../session";
import { useStore } from "../../../storage/store";
import { vehicleTitle } from "../../../storage/model";
import { Badge, Body, Button, Card, Empty, H2, Muted, Progress, Row, Screen, colors } from "../../../ui/kit";

/** Ориентировочная скорость записи в зависимости от канала связи, КБ/с (беспроводные каналы медленные). */
const SPEED_KBS = { ble: 2, webbluetooth: 2, wifi: 15, serial: 10, demo: 500 } as const;

const nowMs = () => Date.now();

function formatDuration(seconds: number) {
  if (seconds < 90) return `около ${Math.max(1, Math.round(seconds))} с`;
  return `около ${Math.round(seconds / 60)} мин`;
}

export default function InstallScreen() {
  const { pkg: pkgId, version, ecu: ecuId } = useLocalSearchParams<{ pkg: string; version: string; ecu: string }>();
  const { liveScan, packages, elm, connection, runScan } = useSession();
  const store = useStore();

  const loaded = packages.find((p) => p.pkg.id === pkgId && p.pkg.version === version);
  const ecu = liveScan?.ecus.find((e) => e.txId === ecuId);

  const [backup, setBackup] = useState<Uint8Array | null>(null);
  const [voltage, setVoltage] = useState<number | null>(liveScan?.adapter.voltage ?? null);
  const [ack, setAck] = useState({ customerConsent: false, legalNotice: false, offRoad: false, wirelessRisk: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [fraction, setFraction] = useState(0);
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Пока идёт запись, закрытие окна приложения требует подтверждения: обрыв может повредить блок.
  useEffect(() => {
    if (!busy || typeof window === "undefined") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  if (!loaded || !ecu || !elm || !liveScan || connection.status !== "ready") {
    return (
      <Screen>
        <Empty title="Нет подключения к автомобилю" hint="Подключитесь к адаптеру на вкладке «Подключение» и откройте установку заново." />
      </Screen>
    );
  }

  const kind = connection.kind;
  const req: InstallRequest = { elm, scan: liveScan, ecu, pkg: loaded.pkg, segments: loaded.segments, transportKind: kind, voltage, backup, ack };
  const checks = installChecks(req);
  const ready = checks.every((c) => c.ok || !c.blocking);
  const totalBytes = loaded.segments.reduce((s, x) => s + x.data.length, 0);
  const seconds = totalBytes / 1024 / SPEED_KBS[kind] + 20;

  const toggle = (key: keyof typeof ack, label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Switch value={ack[key]} onValueChange={(v) => setAck((a) => ({ ...a, [key]: v }))} />
      <Body style={{ flex: 1 }}>{label}</Body>
    </View>
  );

  async function measure() {
    try {
      setVoltage(await elm!.voltage());
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Не удалось измерить напряжение");
    }
  }

  async function makeBackup(): Promise<Uint8Array | null> {
    setBusy("Чтение оригинальной прошивки");
    setNote(null);
    setFraction(0);
    try {
      const b = await readBackup(elm!, ecu!, loaded!.pkg, (_s, f) => setFraction(f));
      setBackup(b);
      return b;
    } catch (e) {
      setNote(`Не удалось прочитать оригинал: ${e instanceof Error ? e.message : "ошибка"}`);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    setOutcome(null);
    setNote(null);
    let b = backup;
    if (!b) b = await makeBackup();
    if (!b) return;
    setBusy("Установка");
    setFraction(0);
    const result = await installPackage({ ...req, backup: b }, (s, f) => {
      setBusy(s);
      setFraction(f);
    });
    setOutcome(result);
    setBusy(null);
    if (result.status === "success" && liveScan!.vin) {
      store.addInstall({ vin: liveScan!.vin, ecuTxId: ecu!.txId, packageId: loaded!.pkg.id, version: loaded!.pkg.version, at: nowMs(), softwareAfter: result.newSoftware });
      void runScan(); // обновляем данные об авто: у блока теперь новый номер ПО
    }
  }

  async function recover() {
    setBusy("Восстановление оригинала");
    setFraction(0);
    const r = await restoreBackup(req, (_s, f) => setFraction(f));
    setNote(r.ok ? "Оригинальная прошивка записана обратно." : `Не удалось восстановить: ${r.error}`);
    setBusy(null);
  }

  return (
    <Screen>
      <H2>{loaded.pkg.title}</H2>
      <Card tone="good">
        <Body style={{ fontWeight: "800" }}>✅ Подключено: {vehicleTitle(liveScan)}</Body>
        <Muted>Установка идёт в этот автомобиль{connection.kind === "demo" ? " (демо: виртуальный блок)" : ""}.</Muted>
      </Card>
      <Muted>Версия {loaded.pkg.version} · блок: {ecu.name} · текущее ПО {ecu.ident.supplierSoftwareNumber ?? ecu.ident.softwareNumber ?? "—"}</Muted>

      <Card>
        <Row label="Канал связи" value={connection.label} />
        <Row label="Адаптер" value={liveScan.adapter.chip} />
        <Row label="Объём данных" value={`${(totalBytes / 1024).toFixed(1)} КБ`} />
        <Row label="Ориентировочное время" value={formatDuration(seconds)} />
        {kind === "ble" || kind === "webbluetooth" ? <Muted>Bluetooth медленный: во время записи держите устройство рядом с авто и не закрывайте приложение.</Muted> : null}
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>Что произойдёт</Body>
        <Muted>1. Приложение прочитает и сохранит оригинальную прошивку блока (резервная копия).</Muted>
        <Muted>2. Проверит питание, совместимость и ваши подтверждения.</Muted>
        <Muted>3. Запишет прошивку по стандарту UDS: сессия программирования, доступ, стирание, загрузка данных.</Muted>
        <Muted>4. Перезапустит блок, прочитает новый номер ПО и сверит с ожидаемым.</Muted>
        <Muted>5. Если что-то пойдёт не так, предложит вернуть оригинал из копии.</Muted>
      </Card>

      <Card>
        <Row label="Напряжение" value={voltage !== null ? `${voltage.toFixed(1)} В` : "не измерено"} />
        <Button title="Измерить напряжение" kind="ghost" onPress={() => void measure()} />
        <Button title={backup ? `Копия оригинала сохранена (${backup.length} байт)` : "Прочитать оригинал заранее"} kind="ghost" onPress={() => void makeBackup()} loading={busy === "Чтение оригинальной прошивки"} />
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>Подтверждения</Body>
        {kind === "ble" || kind === "webbluetooth" || kind === "wifi" ? toggle("wirelessRisk", "Понимаю риск обрыва беспроводной связи; устройство рядом, зарядка подключена") : null}
        {toggle("customerConsent", "Владелец авто согласен на изменение прошивки")}
        {toggle("legalNotice", "Прочитал предупреждение о выбросах и гарантии")}
        {!loaded.pkg.roadLegal ? toggle("offRoad", "Использование только вне дорог общего пользования") : null}
        <Muted>{LEGAL_NOTICE}</Muted>
      </Card>

      <Card tone={ready ? "good" : "warn"}>
        <Body style={{ fontWeight: "700" }}>Проверки перед установкой</Body>
        {checks.map((c) => {
          // Резервную копию приложение читает само перед установкой — пока её нет, это не ошибка, а следующий шаг.
          const pending = c.id === "backup" && !c.ok && !backup && !!loaded.pkg.procedure.backup;
          return (
            <Body key={c.id} style={{ color: c.ok ? colors.good : pending ? colors.warn : c.blocking ? colors.bad : colors.warn }}>
              {c.ok ? "✔" : pending ? "▲" : c.blocking ? "✖" : "▲"} {pending ? "Резервная копия оригинала будет прочитана автоматически перед установкой" : c.text}
            </Body>
          );
        })}
      </Card>

      {busy ? <Progress fraction={fraction} label={busy} /> : null}
      <Button title={backup ? "Установить прошивку" : "Прочитать оригинал и установить"} kind="danger" onPress={() => void start()} disabled={!!busy || (!ready && !!backup) || checks.some((c) => !c.ok && c.blocking && c.id !== "backup")} />
      <Muted>Во время записи нельзя выключать зажигание, отключать адаптер и закрывать приложение.</Muted>
      {note ? <Body style={{ color: colors.warn }}>{note}</Body> : null}

      {outcome ? (
        <Card tone={outcome.status === "success" ? "good" : "bad"}>
          <Badge tone={outcome.status === "success" ? "good" : "bad"} text={outcome.status === "success" ? "Установлено" : "Не выполнено"} />
          {outcome.status === "success" ? (
            <Body>Прошивка установлена. Блок сообщает ПО: {outcome.newSoftware ?? "не считано"}.</Body>
          ) : (
            <Body>{outcome.error}</Body>
          )}
          {outcome.status === "failed" && outcome.needsRecovery ? <Button title="Вернуть оригинальную прошивку" kind="danger" onPress={() => void recover()} /> : null}
          <Muted>Журнал операции{backup ? ` (SHA-256 копии ${sha256Hex(backup).slice(0, 12)}…)` : ""}:</Muted>
          {outcome.audit.map((a, i) => (
            <Muted key={i}>{new Date(a.t).toLocaleTimeString("ru-RU")} · {a.event}{a.detail ? `: ${a.detail}` : ""}</Muted>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
