import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ALL_MAKES, carYears, searchCars, type Car } from "../../../core/cars";
import { identifyFamily } from "../../../core/catalog";
import { firmwareForCar, packagesForEcu } from "../../../core/firmware";
import { resolveModelYear } from "../../../core/vin";
import { useSession } from "../../../session";
import { useStore } from "../../../storage/store";
import { vehicleTitle } from "../../../storage/model";
import { Badge, Body, Button, Card, Empty, Field, H1, H2, Muted, Row, Screen, colors } from "../../../ui/kit";
import { AboutCard } from "../../../ui/AboutCard";
import { BackupCard } from "../../../ui/BackupCard";
import { VehiclesSection } from "../../../ui/VehiclesSection";
import { Diagnostics } from "../../../ui/Diagnostics";
import { codingFitsEcu } from "../../../core/coding";
import { CHINESE_MAKES, DIFFERENCE, TASKS, type TaskKind } from "../../../core/guides";

const EXAMPLES = ["камри", "bmw x5", "прадо 2019", "golf", "мерседес е класс", "крета"];
const STATUS_TEXT = { ready: "Готов к установке", demo: "Демо" } as const;

export default function CarsScreen() {
  const router = useRouter();
  const { scan, liveScan, connection, packages, codingPackages } = useSession();
  const store = useStore();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [section, setSection] = useState<"tasks" | "blocks" | "search" | "library" | "vehicles">("tasks");
  const [allMakes, setAllMakes] = useState(false);
  const sectionParam = useLocalSearchParams<{ section?: string }>().section;
  // Переход с других экранов может сразу открыть нужный раздел (например, «Блоки автомобиля»).
  useEffect(() => {
    if (sectionParam !== "blocks" && sectionParam !== "search" && sectionParam !== "library" && sectionParam !== "tasks" && sectionParam !== "vehicles") return;
    const t = setTimeout(() => setSection(sectionParam), 0);
    return () => clearTimeout(t);
  }, [sectionParam]);
  const [libMessage, setLibMessage] = useState<string | null>(null);

  const results = useMemo(() => searchCars(query), [query]);
  const installs = store.data.installs;

  async function importPackage() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    try {
      const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
      const r = store.addPackage(JSON.parse(text));
      setLibMessage(r.ok ? `Добавлен пакет: ${r.title}` : `Пакет не принят: ${r.error}`);
    } catch {
      setLibMessage("Файл не похож на пакет прошивки (не JSON).");
    }
  }

  const connected = connection.status === "ready" && !!liveScan;
  const userPackages = store.data.packages as { id?: string; version?: string; title?: string }[];

  return (
    <Screen>
      <H1>Авто и прошивки</H1>
      <Card tone={connected ? "good" : undefined}>
        <Body style={{ fontWeight: "700" }}>{connected && scan ? `✅ Подключено: ${vehicleTitle(scan)}` : "Автомобиль не подключён"}</Body>
        {!connected ? <Button title="Подключиться к автомобилю" kind="ghost" onPress={() => router.push("/")} /> : null}
      </Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([["tasks", "Что сделать"], ["blocks", "Блоки автомобиля"], ["search", "Поиск моделей"], ["library", "Библиотека пакетов"], ["vehicles", "Мои автомобили"]] as const).map(([key, label]) => (
          <Pressable key={key} testID={`section-${key}`} onPress={() => setSection(key)} style={{ flexGrow: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", backgroundColor: section === key ? colors.accent : colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {section === "tasks" ? (
        <>
      <H2>Что вы хотите сделать?</H2>
      {(["firmware", "russify", "apps", "coding"] as TaskKind[]).map((k) => {
        const t = TASKS[k];
        return (
          <Card key={k}>
            <Body style={{ fontWeight: "800", fontSize: 17 }}>{`${t.icon} ${t.title}`}</Body>
            <Muted>{t.short}</Muted>
            <Button title="Как это сделать" onPress={() => router.push({ pathname: "/cars/task", params: { kind: k } })} />
          </Card>
        );
      })}
      <Card>
        <Body style={{ fontWeight: "800", fontSize: 17 }}>🔎 Найти и проверить файлы</Body>
        <Muted>Отдельная вкладка «4. Поиск файлов»: ищет прошивки, кодирование, русификацию и приложения, проверяет, подходят ли они машине, и ведёт журнал, откуда что скачано. Ничего не ставит сама.</Muted>
        <Button title="Открыть вкладку поиска файлов" onPress={() => router.push("/files")} />
      </Card>
      <Card>
        <Body style={{ fontWeight: "700" }}>Чем это отличается</Body>
        {DIFFERENCE.map((d) => (
          <Muted key={d.title}>• {d.title}: {d.text}</Muted>
        ))}
      </Card>

        </>
      ) : null}

      {section === "blocks" ? (
        <>
      <H2>Подключённый автомобиль</H2>
      {!scan ? (
        <Card>
          <Body>Автомобиль ещё не определён.</Body>
          <Muted>Подключитесь к адаптеру на вкладке «Подключение»: автомобиль определится сам, и здесь появятся доступные для него прошивки.</Muted>
          <Button title="К подключению" onPress={() => router.push("/")} />
        </Card>
      ) : (
        <>
          <Card tone={connected ? "good" : undefined}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Body style={{ fontWeight: "800", fontSize: 18, flex: 1 }}>{vehicleTitle(scan)}</Body>
              <Badge tone={connected ? "good" : "muted"} text={connected ? "Подключено" : "Последнее сканирование"} />
            </View>
            <Row label="VIN" value={scan.vin} mono />
            <Row label="Модельный год" value={resolveModelYear(scan.vinInfo, scan.vinOnline)} />
            <Row label="Подключение" value={connected ? connection.label : "адаптер не подключён"} />
          </Card>

          {connected && scan.ecus.every((ecu) => packagesForEcu(ecu, scan.vin, packages, installs).length === 0) ? (
            <Card tone="warn">
              <Body style={{ fontWeight: "700" }}>Для этой машины готовых пакетов прошивки нет</Body>
              <Muted>Установить нечего: в библиотеке нет файла под блоки этого автомобиля. В демо пакеты есть для Volkswagen Golf 6, BMW 320d F30 и Toyota Camry XV70. Свой файл можно добавить в разделе «Библиотека пакетов».</Muted>
            </Card>
          ) : null}

          {scan.ecus.map((ecu) => {
            const states = packagesForEcu(ecu, scan.vin, packages, installs);
            const family = identifyFamily(ecu);
            return (
              <Card key={ecu.txId}>
                <Body style={{ fontWeight: "700" }}>{ecu.name}</Body>
                <Muted>
                  {family.name} · ПО: {ecu.ident.supplierSoftwareNumber ?? ecu.ident.softwareNumber ?? ecu.ident.softwareVersion ?? "не считано"}
                </Muted>
                {states.length === 0 ? <Muted>Прошивок для этого блока пока нет.</Muted> : null}
                {codingPackages.filter((c) => codingFitsEcu(c, ecu)).map((c) => (
                  <View key={c.id} style={{ gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      <Badge tone="accent" text="Кодирование" />
                      {c.demo ? <Badge text="Демо" /> : null}
                    </View>
                    <Body style={{ fontWeight: "600" }}>{c.title}</Body>
                    <Muted>{c.description}</Muted>
                    <Button title="Изменить настройки блока" kind="ghost" disabled={!connected} onPress={() => router.push({ pathname: "/cars/coding", params: { pkg: c.id, ecu: ecu.txId } })} />
                    {!connected ? <Muted>Для изменения подключитесь к автомобилю.</Muted> : null}
                  </View>
                ))}
                {states.map((s) => (
                  <View key={s.pkg.id} style={{ gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      <Badge tone={s.state === "current" ? "good" : s.state === "update" ? "warn" : "accent"} text={s.state === "current" ? `Установлена v${s.installedVersion}` : s.state === "update" ? `Обновление: v${s.installedVersion} → v${s.pkg.version}` : `v${s.pkg.version}`} />
                      {s.pkg.demo ? <Badge text="Демо" /> : null}
                    </View>
                    <Body style={{ fontWeight: "600" }}>{s.pkg.title}</Body>
                    {s.pkg.description ? <Muted>{s.pkg.description}</Muted> : null}
                    {s.state !== "current" ? (
                      <Button
                        title={s.state === "update" ? `Обновить до v${s.pkg.version}` : "Установить в автомобиль"}
                        onPress={() => router.push({ pathname: "/cars/install", params: { pkg: s.pkg.id, version: s.pkg.version, ecu: ecu.txId } })}
                        disabled={!connected}
                      />
                    ) : null}
                    {s.state !== "current" && !connected ? <Muted>Для установки подключитесь к автомобилю.</Muted> : null}
                  </View>
                ))}
              </Card>
            );
          })}

          <Button title={showDiag ? "Скрыть подробную диагностику" : "Подробная диагностика"} kind="ghost" onPress={() => setShowDiag((v) => !v)} />
          {showDiag ? <Diagnostics /> : null}
        </>
      )}

        </>
      ) : null}

      {section === "search" ? (
        <>
      <H2>Поиск по моделям</H2>

      <Card>
        <Field label="Поиск автомобиля: марка, модель, год" value={query} onChangeText={setQuery} placeholder="например: камри 2019, bmw g30, прадо" autoCapitalize="none" />
        {!query ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLES.map((e) => (
              <Pressable key={e} onPress={() => setQuery(e)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.muted }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Button title="Очистить поиск" kind="ghost" onPress={() => setQuery("")} />
        )}
      </Card>

      {query ? (
        <>
          <Muted>Найдено: {results.length}{results.length >= 80 ? "+ (уточните запрос)" : ""}</Muted>
          {results.length === 0 ? <Empty title="Ничего не найдено" hint="Попробуйте название марки или модели, можно по-русски: «тойота камри»." /> : null}
          {results.map((car) => (
            <CarRow key={car.id} car={car} open={openId === car.id} onToggle={() => setOpenId(openId === car.id ? null : car.id)} />
          ))}
        </>
      ) : (
        <>
          <H2>Марки</H2>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[...ALL_MAKES].sort((a, b) => Number(!CHINESE_MAKES.includes(a as never)) - Number(!CHINESE_MAKES.includes(b as never)) || a.localeCompare(b)).filter((m) => allMakes || CHINESE_MAKES.includes(m as never)).map((m) => (
              <Pressable key={m} onPress={() => setQuery(m)} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <Button title={allMakes ? "Только китайские марки" : `Показать все марки (${ALL_MAKES.length})`} kind="ghost" onPress={() => setAllMakes((v) => !v)} />
          <Muted>Справочник собран вручную и может быть неполным; прошивки для моделей появятся в списке, как только будут добавлены пакеты.</Muted>
        </>
      )}

        </>
      ) : null}

      {section === "vehicles" ? (
        <>
          <H2>Мои автомобили</H2>
          <VehiclesSection />
        </>
      ) : null}

      {section === "library" ? (
        <>
      <H2>Библиотека пакетов прошивки</H2>
      <Card>
        <Muted>Пакет (.afpkg / .json) содержит прошивку и инструкцию по установке в блок. Загруженные пакеты используются при подключении к авто: приложение само предложит установку или обновление.</Muted>
        <Button title="Добавить пакет из файла" kind="ghost" onPress={() => void importPackage()} />
        <Button title="Приложения и русификация магнитолы (Wi-Fi)" kind="ghost" onPress={() => router.push("/cars/apps")} />
        <Button title="Создать пакет из своего файла" kind="ghost" onPress={() => router.push("/cars/builder")} />
        {libMessage ? <Body>{libMessage}</Body> : null}
        {userPackages.map((p) => (
          <View key={`${p.id}-${p.version}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Muted style={{ flex: 1 }}>{p.title} v{p.version}</Muted>
            <Pressable onPress={() => store.removePackage(p.id ?? "", p.version ?? "")}><Text style={{ color: colors.bad }}>Удалить</Text></Pressable>
          </View>
        ))}
        {userPackages.length === 0 ? <Muted>Своих пакетов пока нет.</Muted> : null}
      </Card>
        <BackupCard />
        <AboutCard />
        </>
      ) : null}

    </Screen>
  );
}

function CarRow({ car, open, onToggle }: { car: Car; open: boolean; onToggle: () => void }) {
  const { packages } = useSession();
  const entries = useMemo(() => firmwareForCar(car, packages), [car, packages]);
  return (
    <Pressable onPress={onToggle}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Body style={{ fontWeight: "700", flex: 1 }}>
            {car.make} {car.model}
          </Body>
          <Badge tone={entries.length ? "good" : "muted"} text={entries.length ? `Прошивок: ${entries.length}` : "Прошивок нет"} />
        </View>
        <Muted>Годы выпуска: {carYears(car)}</Muted>
        {open ? (
          entries.length === 0 ? (
            <Muted>Для этой модели прошивок пока нет. Когда пакет будет добавлен в библиотеку, он появится здесь.</Muted>
          ) : (
            entries.map((e) => (
              <View key={e.key} style={{ gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <Badge tone={e.status === "ready" ? "good" : "muted"} text={STATUS_TEXT[e.status]} />
                  {e.version ? <Badge text={`v${e.version}`} /> : null}
                </View>
                <Body style={{ fontWeight: "600" }}>{e.title}</Body>
                {e.summary ? <Muted>{e.summary}</Muted> : null}
              </View>
            ))
          )
        ) : null}
      </Card>
    </Pressable>
  );
}
