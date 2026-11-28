import { useState } from "react";
import { Platform, Share, View } from "react-native";
import { analyzeScan, identifyFamily } from "../core/catalog";
import { clearDtcs, readFreezeFrame, readReadiness, readinessSummary, type FreezeFrame, type Readiness } from "../core/obd";
import { buildReportHtml, buildReportText } from "../core/report";
import { buildComparisonHtml, buildComparisonText } from "../core/reportExtra";
import { IDENT_DIDS } from "../core/uds";
import { useSession } from "../session";
import { useStore } from "../storage/store";
import { Badge, Body, Button, Card, H2, Muted, Progress, Row, colors } from "./kit";
import { LivePanel } from "./LivePanel";
import { saveReportPdf } from "./files";
import { printHtml } from "./print";

/** Подробная диагностика подключённого авто: блоки, ошибки, живые данные, отчёты. */
export function Diagnostics() {
  const { scan, elm, runScan, runDeepScan, scanning, progress, exclusive } = useSession();
  const store = useStore();
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [freeze, setFreeze] = useState<{ ff: FreezeFrame | null } | null>(null);
  const [busyCheck, setBusyCheck] = useState(false);
  if (!scan) return null;

  const advisories = analyzeScan(scan);
  const vehicle = store.data.vehicles.find((v) => v.vin === scan.vin);

  async function doClear() {
    if (!elm) return;
    try {
      await exclusive("Сброс ошибок", () => clearDtcs(elm));
      setMessage("Ошибки сброшены. Если неисправность осталась, коды появятся снова.");
      setConfirmClear(false);
      await runScan();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось сбросить ошибки");
    }
  }

  async function checkReadiness() {
    if (!elm) return;
    setBusyCheck(true);
    try {
      setReadiness(await exclusive("Проверка готовности систем", () => readReadiness(elm)));
      setMessage(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось прочитать готовность систем");
    } finally {
      setBusyCheck(false);
    }
  }

  async function loadFreeze() {
    if (!elm) return;
    setBusyCheck(true);
    try {
      setFreeze({ ff: await exclusive("Чтение замороженного кадра", () => readFreezeFrame(elm)) });
      setMessage(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось прочитать замороженный кадр");
    } finally {
      setBusyCheck(false);
    }
  }

  const sum = readiness ? readinessSummary(readiness) : null;

  return (
    <View style={{ gap: 12 }}>
      {advisories.map((a, i) => (
        <Card key={i} tone={a.level === "stop" ? "bad" : a.level === "warn" ? "warn" : undefined}>
          <Body>{a.level === "stop" ? "⛔ " : a.level === "warn" ? "⚠️ " : "ℹ️ "}{a.text}</Body>
        </Card>
      ))}

      <H2>Блоки управления ({scan.ecus.length})</H2>
      {scan.ecus.map((ecu) => {
        const family = identifyFamily(ecu);
        return (
          <Card key={ecu.txId}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Body style={{ fontWeight: "700", flex: 1 }}>{ecu.name}</Body>
              <Badge tone="accent" text={ecu.rxId ? `${ecu.txId} → ${ecu.rxId}` : ecu.txId} />
            </View>
            {family.id !== "generic" ? <Badge tone="good" text={family.name} /> : <Badge text="Семейство не распознано" />}
            {IDENT_DIDS.map(({ key, label }) => (
              <Row key={key} label={label} value={ecu.ident[key]} mono />
            ))}
            {ecu.refused > 0 ? <Muted>Блок отказался отдать {ecu.refused} идентификаторов (защита).</Muted> : null}
            {family.id !== "generic" ? <Muted>{family.notes}</Muted> : null}
          </Card>
        );
      })}

      <Card>
        <Body style={{ fontWeight: "700" }}>Не все блоки найдены?</Body>
        <Muted>Обычный поиск проверяет стандартные адреса. Глубокий поиск перебирает все адреса 0x700–0x7DF, где у разных марок сидят шлюз, мультимедиа, панель приборов, кузов. Только чтение, около минуты.</Muted>
        <Button title="Глубокий поиск блоков" kind="ghost" onPress={() => void runDeepScan().then((n) => setMessage(n > 0 ? `Найдено новых блоков: ${n}` : "Новых блоков не найдено"))} disabled={!elm || scanning} loading={scanning && !!progress} />
        {progress ? <Progress fraction={progress.fraction} label={progress.step} /> : null}
        {message ? <Muted>{message}</Muted> : null}
      </Card>

      <H2>Данные OBD-II</H2>
      <Card>
        <Row label="Calibration ID" value={scan.mode09.calibrationIds.join(", ")} mono />
        <Row label="CVN (контрольные суммы)" value={scan.mode09.cvn.join(", ")} mono />
        <Row label="Имя ЭБУ" value={scan.mode09.ecuName} />
        <Row label="Поддерживаемых параметров" value={scan.supportedPids.length} />
        <Row label="Протокол" value={scan.adapter.protocol} />
        <Row label="Адаптер" value={`${scan.adapter.version} · ${scan.adapter.chip}`} />
        <Row label="Напряжение" value={scan.adapter.voltage !== null ? `${scan.adapter.voltage.toFixed(1)} В` : null} />
      </Card>

      <H2>Ошибки ({scan.dtcs.length})</H2>
      <Card tone={scan.dtcs.length ? "warn" : "good"}>
        {scan.dtcs.length === 0 ? <Body>✅ Кодов неисправностей нет.</Body> : null}
        {scan.dtcs.map((d) => (
          <View key={`${d.kind}-${d.code}`} style={{ paddingVertical: 2 }}>
            <Body style={{ fontWeight: "700" }}>
              {d.code} <Muted>({d.kind === "stored" ? "сохранён" : d.kind === "pending" ? "ожидает" : "постоянный"})</Muted>
            </Body>
            <Muted>{d.description ?? "Описание этого кода пока не добавлено в справочник"}</Muted>
          </View>
        ))}
        {scan.dtcs.length > 0 && !confirmClear && elm ? <Button title="Сбросить ошибки" kind="ghost" onPress={() => setConfirmClear(true)} /> : null}
        {confirmClear ? (
          <View style={{ gap: 8 }}>
            <Body style={{ color: colors.warn }}>Сброс удалит коды и данные для диагностики. Сначала запишите их. Продолжить?</Body>
            <Button title="Да, сбросить" kind="danger" onPress={() => void doClear()} />
            <Button title="Отмена" kind="ghost" onPress={() => setConfirmClear(false)} />
          </View>
        ) : null}
        {message ? <Muted>{message}</Muted> : null}
      </Card>

      {scan.warnings.map((w, i) => (
        <Muted key={i}>• {w}</Muted>
      ))}

      <H2>Готовность к техосмотру</H2>
      <Card>
        <Muted>Показывает, горит ли лампа Check Engine и закончили ли проверку системы двигателя (катализатор, датчик кислорода, EVAP и другие). Если проверки не завершены, техосмотр могут не принять.</Muted>
        <Button title="Проверить готовность систем" kind="ghost" onPress={() => void checkReadiness()} loading={busyCheck} disabled={!elm} />
        {readiness && sum ? (
          <>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Badge tone={readiness.milOn ? "bad" : "good"} text={readiness.milOn ? "Лампа Check Engine горит" : "Лампа не горит"} />
              <Badge text={`Кодов ошибок: ${readiness.dtcCount}`} />
              <Badge tone={sum.notReady.length === 0 ? "good" : "warn"} text={`Готовы: ${sum.ready} из ${sum.supported}`} />
            </View>
            {readiness.monitors.filter((m) => m.supported).map((m) => (
              <Row key={m.name} label={m.name} value={m.complete ? "готово" : "не завершено"} />
            ))}
            {sum.notReady.length ? <Muted>Не завершены: {sum.notReady.join(", ")}. Обычно нужно проехать несколько циклов движения после сброса ошибок.</Muted> : <Muted>Все поддерживаемые системы проверены.</Muted>}
          </>
        ) : null}
      </Card>

      <H2>Замороженный кадр</H2>
      <Card>
        <Muted>Двигатель запоминает режим работы в момент первой ошибки: обороты, температуру, нагрузку. Это помогает понять причину.</Muted>
        <Button title="Прочитать замороженный кадр" kind="ghost" onPress={() => void loadFreeze()} loading={busyCheck} disabled={!elm} />
        {freeze ? (
          freeze.ff ? (
            <>
              <Badge tone="warn" text={`Код ошибки: ${freeze.ff.dtc}`} />
              {freeze.ff.values.map((v) => (
                <Row key={v.pid} label={v.name} value={`${Number.isInteger(v.value) ? v.value : v.value.toFixed(1)} ${v.unit}`} />
              ))}
            </>
          ) : (
            <Muted>Замороженного кадра нет: двигатель не запомнил ошибку (или после сброса ошибок кадр стёрт).</Muted>
          )
        ) : null}
      </Card>

      <H2>Данные в реальном времени</H2>
      <LivePanel />

      <H2>Отчёты</H2>
      <Button title="Отправить отчёт о сканировании" kind="ghost" onPress={() => void Share.share({ message: buildReportText(scan) })} />
      {Platform.OS === "web" ? (
        <>
          <Button title="Сохранить отчёт в PDF (с подписями)" onPress={() => void saveReportPdf(buildReportHtml(scan, "AutoFlash"), buildReportText(scan), `Отчёт ${scan.vin ?? "авто"}`).then((f) => setMessage(f ? `PDF сохранён: ${f}` : null))} />
          <Button title="Распечатать" kind="ghost" onPress={() => void printHtml(buildReportHtml(scan, "AutoFlash"), buildReportText(scan))} />
        </>
      ) : null}
      {vehicle && vehicle.scans.length >= 2 ? (
        <Button
          title="Отчёт «до и после» в PDF (первое и последнее сканирование)"
          kind="ghost"
          onPress={() => {
            const first = vehicle.scans[0];
            const last = vehicle.scans[vehicle.scans.length - 1];
            void saveReportPdf(buildComparisonHtml(first, last, { workshop: "AutoFlash" }), buildComparisonText(first, last), `До и после ${scan.vin ?? "авто"}`).then((f) => setMessage(f ? `PDF сохранён: ${f}` : null));
          }}
        />
      ) : (
        <Muted>Отчёт «до и после» появится после второго сканирования этого авто.</Muted>
      )}
      <Button title="Просканировать заново" kind="ghost" onPress={() => void runScan()} loading={scanning} disabled={!elm} />
    </View>
  );
}
