import { useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useMemo, useState } from "react";
import { Switch, View } from "react-native";
import { LEGAL_NOTICE } from "../../../core/catalog";
import {
  ElmReadOnlyProvider,
  SimulatedFlashProvider,
  canStart,
  preflight,
  recoverOriginal,
  runFlash,
  type FlashOutcome,
  type FlashProvider,
  type FlashRequest,
} from "../../../core/flash";
import { sha256Hex } from "../../../core/sha256";
import { useSession } from "../../../session";
import { Badge, Body, Button, Card, Empty, H2, Muted, Progress, Row, Screen, colors } from "../../../ui/kit";

export default function FlashScreen() {
  const { itemId, ecu: ecuId } = useLocalSearchParams<{ itemId: string; ecu: string }>();
  const { scan, catalog, elm } = useSession();

  const item = catalog.find((c) => c.id === itemId);
  const ecu = scan?.ecus.find((e) => e.txId === ecuId);

  const [providerKey, setProviderKey] = useState<"elm" | "sim">("elm");
  const simProvider = useMemo(() => new SimulatedFlashProvider(), []);
  const elmProvider = useMemo(() => new ElmReadOnlyProvider(), []);
  const provider: FlashProvider = providerKey === "sim" ? simProvider : elmProvider;

  const [file, setFile] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [backup, setBackup] = useState<Uint8Array | null>(null);
  const [voltage, setVoltage] = useState<number | null>(scan?.adapter.voltage ?? null);
  const [ack, setAck] = useState({ customerConsent: false, legalNotice: false, offRoad: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [fraction, setFraction] = useState(0);
  const [outcome, setOutcome] = useState<FlashOutcome | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!item || !ecu || !scan) return <Screen><Empty title="Позиция или блок не найдены" hint="Вернитесь на вкладку «Прошивки» и выберите заново." /></Screen>;

  const req: FlashRequest = { scan, ecu, item, file, provider, voltage, backup, ack };
  const checks = preflight(req);
  const ready = canStart(checks);

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const buf = asset.file ? await asset.file.arrayBuffer() : await new File(asset.uri).arrayBuffer();
    setFile(new Uint8Array(buf));
    setFileName(asset.name);
  }

  async function measureVoltage() {
    if (!elm) return setNote("Нет подключения к адаптеру");
    try {
      setVoltage(await elm.voltage());
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Не удалось измерить");
    }
  }

  async function makeBackup() {
    setBusy("Чтение оригинальной прошивки");
    setNote(null);
    try {
      setBackup(await provider.readOriginal(ecu!, (_s, f) => setFraction(f)));
    } catch {
      setNote("Интерфейс не умеет читать прошивку блока. Подключите J2534-интерфейс или выберите симуляцию для проверки процесса.");
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    setBusy("Запись");
    setOutcome(null);
    setFraction(0);
    const result = await runFlash(req, (_s, f) => setFraction(f));
    setOutcome(result);
    setBusy(null);
  }

  async function recover() {
    setBusy("Восстановление оригинала");
    const r = await recoverOriginal(req, (_s, f) => setFraction(f));
    setNote(r.ok ? "Оригинальная прошивка восстановлена и проверена." : `Не удалось восстановить: ${r.error}`);
    setBusy(null);
  }

  const toggle = (key: keyof typeof ack, label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Switch value={ack[key]} onValueChange={(v) => setAck((a) => ({ ...a, [key]: v }))} />
      <Body style={{ flex: 1 }}>{label}</Body>
    </View>
  );

  return (
    <Screen>
      <H2>{item.title}</H2>
      <Muted>Блок: {ecu.name} · ПО {ecu.ident.softwareVersion ?? ecu.ident.supplierSoftwareNumber ?? "—"}</Muted>

      <Card>
        <Body style={{ fontWeight: "700" }}>1. Интерфейс прошивки</Body>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="ELM327" kind={providerKey === "elm" ? "primary" : "ghost"} onPress={() => setProviderKey("elm")} /></View>
          <View style={{ flex: 1 }}><Button title="Симуляция" kind={providerKey === "sim" ? "primary" : "ghost"} onPress={() => setProviderKey("sim")} /></View>
        </View>
        <Muted>{providerKey === "elm" ? "ELM327 только читает и диагностирует: прошить блок через него нельзя." : "Симуляция проверяет весь процесс на виртуальном блоке, ничего не записывая в авто."}</Muted>
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>2. Файл прошивки</Body>
        <Button title={fileName ? `Файл: ${fileName}` : "Выбрать файл"} kind="ghost" onPress={() => void pickFile()} />
        {file ? <Row label="SHA-256" value={sha256Hex(file).slice(0, 24) + "…"} mono /> : null}
        {item.fileSha256 ? <Row label="Эталон в каталоге" value={item.fileSha256.slice(0, 24) + "…"} mono /> : <Muted>В каталоге для этой позиции нет эталонной суммы: прошивка будет заблокирована.</Muted>}
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>3. Питание и резервная копия</Body>
        <Row label="Напряжение" value={voltage !== null ? `${voltage.toFixed(1)} В` : "не измерено"} />
        <Button title="Измерить напряжение" kind="ghost" onPress={() => void measureVoltage()} />
        <Button title={backup ? `Копия оригинала сохранена (${backup.length} байт)` : "Сохранить копию оригинальной прошивки"} kind="ghost" onPress={() => void makeBackup()} loading={busy === "Чтение оригинальной прошивки"} />
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>4. Подтверждения</Body>
        {toggle("customerConsent", "Владелец авто согласен на изменение прошивки")}
        {toggle("legalNotice", "Я прочитал предупреждение о выбросах и гарантии")}
        {!item.roadLegal ? toggle("offRoad", "Использование только вне дорог общего пользования") : null}
        <Muted>{LEGAL_NOTICE}</Muted>
      </Card>

      <Card tone={ready ? "good" : "warn"}>
        <Body style={{ fontWeight: "700" }}>Проверки перед запуском</Body>
        {checks.map((c) => (
          <Body key={c.id} style={{ color: c.ok ? colors.good : c.blocking ? colors.bad : colors.warn }}>
            {c.ok ? "✔" : c.blocking ? "✖" : "▲"} {c.text}
          </Body>
        ))}
      </Card>

      {busy ? <Progress fraction={fraction} label={busy} /> : null}
      <Button title="Прошить блок" kind="danger" onPress={() => void start()} disabled={!ready || !!busy} />
      <Muted>Во время записи нельзя выключать зажигание, отключать адаптер и закрывать приложение.</Muted>

      {note ? <Body style={{ color: colors.warn }}>{note}</Body> : null}

      {outcome ? (
        <Card tone={outcome.status === "success" ? "good" : "bad"}>
          <Badge tone={outcome.status === "success" ? "good" : "bad"} text={outcome.status === "success" ? "Готово" : "Не выполнено"} />
          {outcome.status === "failed" ? <Body>{outcome.error}</Body> : <Body>Запись выполнена и подтверждена обратным чтением.</Body>}
          {outcome.status === "failed" && outcome.needsRecovery ? <Button title="Восстановить оригинал" kind="danger" onPress={() => void recover()} /> : null}
          <Muted>Журнал операции:</Muted>
          {outcome.audit.map((a, i) => (
            <Muted key={i}>{new Date(a.t).toLocaleTimeString("ru-RU")} · {a.event}{a.detail ? `: ${a.detail}` : ""}</Muted>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
