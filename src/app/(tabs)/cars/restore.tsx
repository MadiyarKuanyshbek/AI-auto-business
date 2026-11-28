import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { MIN_FLASH_VOLTAGE, restoreBackup } from "../../../core/install";
import { useSession } from "../../../session";
import { vehicleTitle } from "../../../storage/model";
import { useStore } from "../../../storage/store";
import { desktopBridge, type FirmwareBackupMeta } from "../../../transport/desktop";
import { Badge, Body, Button, Card, Empty, H2, Muted, Progress, Row, Screen, colors } from "../../../ui/kit";

/** Возврат прежней прошивки блока из сохранённой копии оригинала. */
export default function RestoreScreen() {
  const { id, vin } = useLocalSearchParams<{ id: string; vin: string }>();
  const bridge = desktopBridge();
  const { liveScan, elm, connection, packages, exclusive } = useSession();
  const store = useStore();
  const [meta, setMeta] = useState<FirmwareBackupMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fraction, setFraction] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!bridge || !id) return;
    const t = setTimeout(() => {
      bridge.fwbackup
        .list(vin ?? "")
        .then((l) => {
          const m = l.find((x) => x.id === id);
          if (m) setMeta(m);
          else setLoadError("Копия не найдена на диске");
        })
        .catch(() => setLoadError("Не удалось прочитать список копий"));
    }, 100);
    return () => clearTimeout(t);
  }, [bridge, id, vin]);

  if (!bridge) {
    return (
      <Screen>
        <Empty title="Только в настольной программе" hint="Возврат прошивки из копии работает в программе AutoFlash для Windows." />
      </Screen>
    );
  }
  if (loadError) {
    return (
      <Screen>
        <Empty title="Копия недоступна" hint={loadError} />
      </Screen>
    );
  }
  if (!meta) {
    return (
      <Screen>
        <Muted>Читаю сведения о копии…</Muted>
      </Screen>
    );
  }

  const ecu = liveScan?.ecus.find((e) => e.txId === meta.txId);
  const pkg = packages.find((p) => p.pkg.id === meta.pkgId && p.pkg.version === meta.pkgVersion)?.pkg ?? packages.find((p) => p.pkg.id === meta.pkgId)?.pkg;
  const sameCar = !!liveScan && (liveScan.vin ?? "") === meta.vin;
  const voltage = liveScan?.adapter.voltage ?? null;
  const voltageOk = voltage !== null && voltage >= MIN_FLASH_VOLTAGE;
  const connected = connection.status === "ready" && !!liveScan && !!elm;
  const checks = [
    { ok: connected, text: connected ? `Подключено: ${vehicleTitle(liveScan!)}` : "Нет подключения к автомобилю" },
    { ok: sameCar, text: sameCar ? "VIN совпадает с автомобилем, с которого снята копия" : "VIN не совпадает: копия снята с другого автомобиля" },
    { ok: !!ecu, text: ecu ? `Блок найден: ${ecu.name}` : "Такого блока у подключённого автомобиля нет" },
    { ok: !!pkg, text: pkg ? `Пакет «${pkg.title}» есть в библиотеке: по его процедуре копия будет записана` : "Пакета, с которым снималась копия, нет в библиотеке: добавьте его, иначе неизвестно, как писать в этот блок" },
    { ok: voltageOk, text: voltageOk ? `Напряжение ${voltage!.toFixed(1)} В` : `Напряжение ниже ${MIN_FLASH_VOLTAGE} В или не измерено` },
  ];
  const ready = checks.every((c) => c.ok) && consent && !busy;

  async function run() {
    if (!ecu || !pkg || !elm || !liveScan) return;
    setResult(null);
    setBusy("Читаю копию и проверяю контрольную сумму");
    setFraction(0);
    const read = await bridge!.fwbackup.read(meta!.id, meta!.vin);
    if (!read.ok) {
      setBusy(null);
      return setResult({ ok: false, text: read.error });
    }
    const bin = atob(read.dataBase64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const r = await exclusive("Возврат прежней прошивки", () =>
      restoreBackup(
        { elm, scan: liveScan, ecu, pkg, segments: [], transportKind: connection.status === "ready" ? connection.kind : "serial", voltage, backup: bytes, ack: { customerConsent: true, legalNotice: true, offRoad: false, wirelessRisk: true } },
        (s, f) => {
          setBusy(s);
          setFraction(f);
        },
      ),
    );
    setBusy(null);
    if (r.ok) store.addFileLog({ kind: "firmware", action: "restored", name: `${meta!.ecuName}: прошивка ПО ${meta!.software}`, sha256: meta!.sha256, size: meta!.size, car: { title: vehicleTitle(liveScan), vin: liveScan.vin ?? "" }, note: `Возвращена из сохранённой копии от ${new Date(meta!.at).toLocaleString("ru-RU")}` });
    setResult(r.ok ? { ok: true, text: "Прежняя прошивка записана обратно. Блок перезапущен: выключите и включите зажигание, затем нажмите «Определить заново»." } : { ok: false, text: `Не удалось вернуть: ${r.error}` });
  }

  return (
    <Screen>
      <H2>Вернуть прежнюю прошивку</H2>
      <Card>
        <Body style={{ fontWeight: "700" }}>{meta.ecuName}</Body>
        <Row label="Версия ПО на момент копии" value={meta.software} mono />
        <Row label="Снята" value={new Date(meta.at).toLocaleString("ru-RU")} />
        <Row label="Размер" value={`${(meta.size / 1024).toFixed(1)} КБ`} />
        <Row label="SHA-256" value={`${meta.sha256.slice(0, 16)}…`} mono />
        <Muted>Копия сохранена до установки пакета «{meta.pkgId}» v{meta.pkgVersion} и не меняется приложением.</Muted>
      </Card>

      <Card>
        {checks.map((c) => (
          <Body key={c.text} style={{ color: c.ok ? colors.good : colors.warn }}>
            {c.ok ? "✓ " : "✖ "}
            {c.text}
          </Body>
        ))}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Switch testID="restore-consent" value={consent} onValueChange={setConsent} />
          <Body style={{ flex: 1 }}>Я понимаю, что текущая прошивка блока будет заменена сохранённой копией, и не буду выключать зажигание и адаптер до конца.</Body>
        </View>
        {busy ? <Progress fraction={fraction} label={busy} /> : null}
        <Button title="Вернуть эту прошивку" disabled={!ready} onPress={() => void run()} loading={!!busy} />
        {result ? <Badge tone={result.ok ? "good" : "bad"} text={result.text} /> : null}
      </Card>
    </Screen>
  );
}
