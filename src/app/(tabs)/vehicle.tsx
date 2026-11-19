import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { analyzeScan, identifyFamily } from "../../core/catalog";
import { clearDtcs } from "../../core/obd";
import { IDENT_DIDS } from "../../core/uds";
import { buildComparisonHtml, buildComparisonText } from "../../core/reportExtra";
import { resolveModelYear } from "../../core/vin";
import { useSession } from "../../session";
import { useStore } from "../../storage/store";
import { vehicleTitle } from "../../storage/model";
import { Badge, Body, Button, Card, Empty, H1, H2, Muted, Row, Screen, colors } from "../../ui/kit";
import { LivePanel } from "../../ui/LivePanel";
import { printHtml } from "../../ui/print";

export default function VehicleScreen() {
  const router = useRouter();
  const { scan, elm, runScan, scanning } = useSession();
  const store = useStore();
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!scan) {
    return (
      <Screen>
        <Empty title="Автомобиль ещё не определён" hint="Подключитесь к адаптеру и нажмите «Сканировать автомобиль» на вкладке «Подключение»." />
        <Button title="К подключению" onPress={() => router.push("/")} />
      </Screen>
    );
  }

  const info = scan.vinOnline;
  const offline = scan.vinInfo;
  const advisories = analyzeScan(scan);
  const vehicle = store.data.vehicles.find((v) => v.vin === scan.vin);

  async function doClear() {
    if (!elm) return;
    try {
      await clearDtcs(elm);
      setMessage("Ошибки сброшены. Если неисправность осталась, коды появятся снова.");
      setConfirmClear(false);
      await runScan();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не удалось сбросить ошибки");
    }
  }

  function createJob() {
    const job = store.addJob({ title: `Диагностика: ${vehicleTitle(scan!)}`, vehicleId: vehicle?.id ?? null, customerId: vehicle?.customerId ?? null, status: "diagnostics" });
    router.push({ pathname: "/clients/job/[id]", params: { id: job.id } });
  }

  return (
    <Screen>
      <H1>{vehicleTitle(scan)}</H1>
      <Muted>Сканирование от {new Date(scan.scannedAt).toLocaleString("ru-RU")}</Muted>
      <Card>
        <Row label="VIN" value={scan.vin} mono />
        <Row label="Производитель" value={info?.make ?? offline?.make} />
        <Row label="Модель" value={info?.model} />
        <Row label="Модельный год" value={resolveModelYear(offline, info)} />
        <Row label="Двигатель" value={[info?.displacementL ? `${info.displacementL} л` : null, info?.cylinders ? `${info.cylinders} цил.` : null, info?.engine].filter(Boolean).join(" · ")} />
        <Row label="Топливо" value={info?.fuel} />
        <Row label="Привод" value={info?.drive} />
        <Row label="Регион сборки" value={offline?.region} />
        {offline && !offline.valid ? <Badge tone="bad" text={offline.problem ?? "VIN некорректен"} /> : null}
        {!info ? <Muted>Онлайн-справочник недоступен (нет интернета или VIN не из базы): показаны данные, определённые офлайн.</Muted> : null}
      </Card>

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
              <Badge tone="accent" text={`${ecu.txId} → ${ecu.rxId}`} />
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

      <H2>Данные по OBD-II</H2>
      <Card>
        <Row label="Calibration ID" value={scan.mode09.calibrationIds.join(", ")} mono />
        <Row label="CVN (контрольные суммы)" value={scan.mode09.cvn.join(", ")} mono />
        <Row label="Имя ЭБУ" value={scan.mode09.ecuName} />
        <Row label="Поддерживаемых параметров" value={scan.supportedPids.length} />
        <Row label="Протокол" value={scan.adapter.protocol} />
        <Row label="Адаптер" value={scan.adapter.version} />
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
        {scan.dtcs.length > 0 && !confirmClear ? <Button title="Сбросить ошибки" kind="ghost" onPress={() => setConfirmClear(true)} /> : null}
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

      <H2>Данные в реальном времени</H2>
      <LivePanel />

      <Button title="Что можно улучшить" onPress={() => router.push("/tune")} />
      {vehicle && vehicle.scans.length >= 2 ? (
        <Button
          title="Отчёт «до и после» (первое и последнее сканирование)"
          kind="ghost"
          onPress={() => {
            const first = vehicle.scans[0];
            const last = vehicle.scans[vehicle.scans.length - 1];
            void printHtml(buildComparisonHtml(first, last, { workshop: store.data.settings.workshopName }), buildComparisonText(first, last));
          }}
        />
      ) : (
        <Muted>Отчёт «до и после» появится после второго сканирования этого авто.</Muted>
      )}
      <Button title="Создать заказ для этого авто" kind="ghost" onPress={createJob} />
      <Button title="Просканировать заново" kind="ghost" onPress={() => void runScan()} loading={scanning} />
    </Screen>
  );
}
