import { useRouter } from "expo-router";
import { View } from "react-native";
import { LEGAL_NOTICE, identifyFamily, matchCatalog } from "../../../core/catalog";
import { useSession } from "../../../session";
import { useStore } from "../../../storage/store";
import { formatKzt, vehicleTitle } from "../../../storage/model";
import { Badge, Body, Button, Card, Empty, H2, Muted, Screen } from "../../../ui/kit";

const CATEGORY: Record<string, string> = {
  performance: "Мощность",
  economy: "Экономичность",
  reliability: "Надёжность",
  comfort: "Комфорт",
  diagnostics: "Диагностика",
  transmission: "Коробка передач",
};

export default function TuneScreen() {
  const router = useRouter();
  const { scan, catalog } = useSession();
  const store = useStore();

  if (!scan) {
    return (
      <Screen>
        <Empty title="Сначала определите автомобиль" hint="Рекомендации строятся по реальным номерам ПО блоков, которые считывает сканирование." />
        <Button title="К подключению" onPress={() => router.push("/")} />
      </Screen>
    );
  }

  const matches = matchCatalog(scan, catalog);

  function requestFile(ecuName: string) {
    const vehicle = store.data.vehicles.find((v) => v.vin === scan!.vin);
    const job = store.addJob({
      title: `Подбор прошивки: ${vehicleTitle(scan!)} · ${ecuName}`,
      vehicleId: vehicle?.id ?? null,
      customerId: vehicle?.customerId ?? null,
      status: "awaiting_file",
    });
    router.push({ pathname: "/clients/job/[id]", params: { id: job.id } });
  }

  return (
    <Screen>
      <H2>Что можно сделать с этим авто</H2>
      <Muted>Рекомендации подбираются по номеру ПО и семейству каждого блока. Позиции помечены «Демо», пока для них нет проверенного файла.</Muted>

      {scan.ecus.map((ecu) => {
        const family = identifyFamily(ecu);
        const own = matches.filter((m) => m.ecu.txId === ecu.txId);
        return (
          <View key={ecu.txId} style={{ gap: 10 }}>
            <Card>
              <Body style={{ fontWeight: "700" }}>{ecu.name}</Body>
              <Muted>
                {family.name}
                {family.typicalFlash.length ? ` · обычно прошивается: ${family.typicalFlash.map((m) => ({ obd: "по OBD", boot: "BOOT", bench: "на столе" })[m]).join(", ")}` : ""}
              </Muted>
              <Muted>ПО: {ecu.ident.supplierSoftwareNumber ?? ecu.ident.softwareNumber ?? ecu.ident.softwareVersion ?? "не считано"}</Muted>
            </Card>

            {own.length === 0 ? (
              <Card>
                <Body>Для этого блока в каталоге пока ничего нет.</Body>
                <Button title="Запросить подбор прошивки" kind="ghost" onPress={() => requestFile(ecu.name)} />
              </Card>
            ) : (
              own.map((m) => (
                <Card key={m.item.id}>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    <Badge tone="accent" text={CATEGORY[m.item.category] ?? m.item.category} />
                    <Badge tone={m.confidence === "exact" ? "good" : "warn"} text={m.confidence === "exact" ? "Точное совпадение ПО" : "Совпало семейство блока"} />
                    <Badge tone={m.item.status === "verified" ? "good" : m.item.status === "beta" ? "warn" : "muted"} text={{ demo: "Демо", beta: "Бета", verified: "Проверено" }[m.item.status]} />
                  </View>
                  <Body style={{ fontWeight: "700" }}>{m.item.title}</Body>
                  <Muted>{m.item.summary}</Muted>
                  {m.item.benefits.map((b) => (
                    <Muted key={b}>＋ {b}</Muted>
                  ))}
                  {m.item.risks.map((r) => (
                    <Muted key={r}>⚠︎ {r}</Muted>
                  ))}
                  {m.item.priceKzt ? <Body>{formatKzt(m.item.priceKzt)}</Body> : null}
                  <Button title="Подготовить прошивку" onPress={() => router.push({ pathname: "/tune/flash", params: { itemId: m.item.id, ecu: ecu.txId } })} />
                </Card>
              ))
            )}
          </View>
        );
      })}

      <Card tone="warn">
        <Muted>{LEGAL_NOTICE}</Muted>
      </Card>
    </Screen>
  );
}
