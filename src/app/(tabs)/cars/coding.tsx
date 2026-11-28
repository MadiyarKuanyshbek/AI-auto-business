import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Switch, View } from "react-native";
import { activeOptions, applyOptions, bytesHex, codingFitsEcu, diffBytes, readCoding, writeCoding } from "../../../core/coding";
import { useSession } from "../../../session";
import { vehicleTitle } from "../../../storage/model";
import { useStore } from "../../../storage/store";
import { Badge, Body, Button, Card, Empty, H2, Muted, Row, Screen, colors } from "../../../ui/kit";

/** Кодирование блока: чтение настроек, выбор изменений, запись с проверкой и откатом. */
export default function CodingScreen() {
  const { pkg: pkgId, ecu: txId } = useLocalSearchParams<{ pkg: string; ecu: string }>();
  const { elm, liveScan, connection, codingPackages } = useSession();
  const store = useStore();
  const pkg = codingPackages.find((p) => p.id === pkgId);
  const ecu = liveScan?.ecus.find((e) => e.txId === txId);

  const [original, setOriginal] = useState<number[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Читаем текущие настройки блока при открытии экрана.
  useEffect(() => {
    if (!elm || !ecu || !pkg) return;
    let alive = true;
    const t = setTimeout(() => {
      readCoding(elm, ecu, pkg)
        .then((v) => {
          if (!alive) return;
          setOriginal(v);
          setChosen(activeOptions(v, pkg));
          setReadError(null);
        })
        .catch((e) => alive && setReadError(e instanceof Error ? e.message : "Не удалось прочитать настройки"));
    }, 100);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [elm, ecu, pkg]);

  const next = useMemo(() => (original && pkg ? applyOptions(original, pkg, chosen) : null), [original, pkg, chosen]);
  const diff = original && next ? diffBytes(original, next) : [];
  const history = store.data.coding.filter((c) => ecu && c.txId === ecu.txId && c.vin === (liveScan?.vin ?? ""));

  if (!pkg || !ecu || !elm || !liveScan || connection.status !== "ready") {
    return (
      <Screen>
        <Empty title="Нет подключения к автомобилю" hint="Подключитесь к автомобилю на вкладке «Подключение» и откройте кодирование из раздела «Блоки автомобиля»." />
      </Screen>
    );
  }
  if (!codingFitsEcu(pkg, ecu)) {
    return (
      <Screen>
        <Empty title="Пакет не подходит этому блоку" hint="Адрес или версия ПО блока не совпадают с тем, под что составлен пакет." />
      </Screen>
    );
  }

  const demo = connection.kind === "demo";

  async function apply() {
    if (!original || !next || !elm || !ecu || !pkg) return;
    setResult(null);
    setStep("Начинаю");
    const res = await writeCoding(elm, ecu, pkg, original, next, setStep);
    setStep(null);
    if (res.status === "success") {
      store.addCodingRecord({ vin: liveScan?.vin ?? "", ecuName: ecu.name, txId: ecu.txId, did: pkg.target.did, pkgId: pkg.id, pkgTitle: pkg.title, before: original, after: next });
      setOriginal(next);
      setResult({ ok: true, text: "Настройки записаны и проверены. Если функция не появилась, выключите и включите зажигание." });
      setConsent(false);
    } else {
      setResult({ ok: false, text: `Запись не удалась: ${res.error}. ${res.rolledBack ? "Прежние настройки возвращены." : "Прежние настройки вернуть автоматически не удалось: используйте журнал ниже."}` });
    }
  }

  async function revert(before: number[], after: number[]) {
    if (!elm || !ecu || !pkg) return;
    setStep("Возвращаю прежние настройки");
    const res = await writeCoding(elm, ecu, pkg, after, before, setStep);
    setStep(null);
    if (res.status === "success") {
      setOriginal(before);
      setChosen(activeOptions(before, pkg));
      store.addCodingRecord({ vin: liveScan?.vin ?? "", ecuName: ecu.name, txId: ecu.txId, did: pkg.target.did, pkgId: pkg.id, pkgTitle: `${pkg.title} (возврат)`, before: after, after: before });
      setResult({ ok: true, text: "Прежние настройки возвращены." });
    } else setResult({ ok: false, text: `Не удалось вернуть: ${res.error}` });
  }

  const toggle = (id: string, on: boolean) => setChosen((c) => (on ? [...c.filter((x) => x !== id), id] : c.filter((x) => x !== id)));

  return (
    <Screen>
      <H2>{pkg.title}</H2>
      <Card tone="good">
        <Body style={{ fontWeight: "800" }}>✅ Подключено: {vehicleTitle(liveScan)}</Body>
        <Muted>Блок: {ecu.name}{demo ? ". Демо: виртуальный блок" : ""}</Muted>
      </Card>
      <Muted>{pkg.description}</Muted>

      {readError ? (
        <Card tone="bad">
          <Body style={{ fontWeight: "700" }}>Не удалось прочитать настройки блока</Body>
          <Muted>{readError}</Muted>
        </Card>
      ) : null}

      {original ? (
        <>
          <Card>
            <Row label="Текущие настройки блока" value={bytesHex(original)} mono />
            <Row label="Станут" value={next ? bytesHex(next) : ""} mono />
            <Muted>{diff.length ? `Изменится байтов: ${diff.length}` : "Изменений нет."}</Muted>
          </Card>

          <H2>Что включить</H2>
          {pkg.options.map((o) => (
            <Card key={o.id}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: "700" }}>{o.title}</Body>
                  <Muted>{o.description}</Muted>
                </View>
                <Switch testID={`opt-${o.id}`} value={chosen.includes(o.id)} onValueChange={(v) => toggle(o.id, v)} trackColor={{ true: colors.accent }} />
              </View>
            </Card>
          ))}

          <Card>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {pkg.demo ? <Badge text="Демо" /> : null}
              <Badge tone={pkg.roadLegal ? "good" : "warn"} text={pkg.roadLegal ? "Допустимо на дорогах" : "Только для закрытой территории"} />
              <Badge tone="warn" text={pkg.security ? "Нужен доступ к блоку (ключ)" : "Доступ без ключа"} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Switch testID="coding-consent" value={consent} onValueChange={setConsent} />
              <Body style={{ flex: 1 }}>Я понимаю, что настройки блока будут изменены. Прежние значения сохранены и их можно вернуть.</Body>
            </View>
            {step ? <Muted>{step}…</Muted> : null}
            <Button title="Записать настройки" disabled={!consent || diff.length === 0 || !!step} onPress={() => void apply()} loading={!!step} />
            {result ? <Badge tone={result.ok ? "good" : "bad"} text={result.text} /> : null}
          </Card>
        </>
      ) : !readError ? (
        <Card>
          <Body>Читаю текущие настройки блока…</Body>
        </Card>
      ) : null}

      {history.length > 0 ? (
        <>
          <H2>Журнал изменений</H2>
          {history.map((h) => (
            <Card key={h.id}>
              <Body style={{ fontWeight: "600" }}>{h.pkgTitle}</Body>
              <Muted>{new Date(h.at).toLocaleString("ru-RU")}</Muted>
              <Row label="Было" value={bytesHex(h.before)} mono />
              <Row label="Стало" value={bytesHex(h.after)} mono />
              <Button title="Вернуть «Было»" kind="ghost" disabled={!!step} onPress={() => void revert(h.before, h.after)} />
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
