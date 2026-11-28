import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Image, Linking, Pressable, ScrollView, Text, View, useWindowDimensions, type ScrollViewInstance } from "react-native";
import { ALL_CARS, ALL_MAKES, carYears, matchScannedCar, searchCars, type Car } from "../../core/cars";
import { packagesForCar } from "../../core/firmware";
import {
  THEMES,
  TRIM_LABEL,
  baseModel,
  describeProfile,
  generationLabel,
  interfaceFilesFor,
  profileFor,
  type InterfaceFile,
  type InterfaceTheme,
  type ThemeId,
  type TrimLevel,
} from "../../core/interfaces";
import { ANDROID_HEADUNIT_NOTE, installMethodFor } from "../../core/installMethods";
import { resolveModelYear } from "../../core/vin";
import { useSession } from "../../session";
import { useStore } from "../../storage/store";
import { CabinPreview } from "../../ui/CabinPreview";
import { Badge, Body, Button, Card, Empty, Field, H2, Muted, Row, colors } from "../../ui/kit";

const SIDEBAR_WIDTH = 320; // ширина бокового меню на компьютере
const MAX_IMAGE_BYTES = 2_500_000;
const TRIMS: TrimLevel[] = ["base", "mid", "top"];
const TARGET_TEXT = { cluster: "Приборная панель", center: "Центральный экран", ambient: "Подсветка салона", hud: "Проекция на стекло" } as const;

async function imageToDataUrl(asset: DocumentPicker.DocumentPickerAsset): Promise<string | null> {
  if (asset.file) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(asset.file as Blob);
    });
  }
  try {
    const b64 = await new File(asset.uri).base64();
    return `data:${asset.mimeType ?? "image/jpeg"};base64,${b64}`;
  } catch {
    return null;
  }
}

export default function InterfaceDemoScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { liveScan, scan, connection, packages } = useSession();
  const store = useStore();
  const installedIds = useMemo(() => new Set(store.data.installs.filter((r) => r.vin === scan?.vin).map((r) => r.packageId)), [store.data.installs, scan?.vin]);

  const [query, setQuery] = useState("");
  const [carId, setCarId] = useState<string | null>(null);
  const [trim, setTrim] = useState<TrimLevel>("top");
  const [themeId, setThemeId] = useState<ThemeId | null>(null);
  const [centerMode, setCenterMode] = useState<"scheme" | "photo">("scheme");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [linkText, setLinkText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showUnfit, setShowUnfit] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // Подключённый автомобиль выбираем сам, пока пользователь ничего не выбрал.
  const autoCarId = useMemo(() => {
    if (!scan) return null;
    return matchScannedCar(scan.vinOnline?.make ?? scan.vinInfo?.make, scan.vinOnline?.model, resolveModelYear(scan.vinInfo, scan.vinOnline))[0]?.id ?? null;
  }, [scan]);
  const effectiveCarId = carId ?? autoCarId;

  const car = useMemo(() => ALL_CARS.find((c) => c.id === effectiveCarId) ?? null, [effectiveCarId]);
  const profile = useMemo(() => (car ? profileFor(car, trim) : null), [car, trim]);
  const carPackages = useMemo(() => (car ? packagesForCar(car, packages) : []), [car, packages]);
  const readyByTheme = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of carPackages) if (p.interface?.theme) map[p.interface.theme] = p.id;
    return map;
  }, [carPackages]);
  const files = useMemo(() => (car ? interfaceFilesFor(car, trim, readyByTheme) : []), [car, trim, readyByTheme]);
  const theme: InterfaceTheme | null = themeId ? (THEMES.find((t) => t.id === themeId) ?? null) : null;
  const selectedFile = files.find((f) => f.theme.id === themeId) ?? null;
  const queued = !!selectedFile && !!car && store.data.queue.some((q) => q.carId === car.id && q.fileName === selectedFile.fileName);
  const results = useMemo(() => searchCars(query), [query]);
  const media = car ? (store.data.media[car.id] ?? []) : [];
  const photos = media.filter((m) => m.kind === "image");
  const shownPhoto = photos.find((p) => p.id === photoId) ?? photos[0];

  const wide = width - SIDEBAR_WIDTH >= 760;

  function pickCar(c: Car) {
    setCarId(c.id);
    setThemeId(null);
    setCenterMode("scheme");
    setPhotoId(null);
  }

  async function addPhoto() {
    if (!car) return;
    const res = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    if ((asset.size ?? 0) > MAX_IMAGE_BYTES) return setMessage("Фото больше 2,5 МБ: уменьшите его.");
    const url = await imageToDataUrl(asset);
    if (!url) return setMessage("Не удалось прочитать фото.");
    store.addMedia(car.id, { kind: "image", title: asset.name, url });
    setMessage(null);
  }

  function addLink() {
    if (!car) return;
    if (!/^https?:\/\/\S+$/i.test(linkText.trim())) return setMessage("Вставьте ссылку, которая начинается с http:// или https://");
    store.addMedia(car.id, { kind: "link", title: linkText.trim().replace(/^https?:\/\//i, "").slice(0, 60), url: linkText.trim() });
    setLinkText("");
    setMessage(null);
  }

  const connectedMatches = !!car && !!liveScan && matchScannedCar(liveScan.vinOnline?.make ?? liveScan.vinInfo?.make, liveScan.vinOnline?.model, resolveModelYear(liveScan.vinInfo, liveScan.vinOnline)).some((c) => c.id === car.id);

  // ───────── Центр: салон ─────────
  const centerPanel = (
    <View style={{ gap: 10, minWidth: 0 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{car ? `${car.make} ${car.model}` : "Демо интерфейс авто"}</Text>
      {car && profile ? (
        <>
          <Muted>
            {carYears(car)} · комплектация: {TRIM_LABEL[trim]}
          </Muted>
          {photos.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Button title="Схема экранов" kind={centerMode === "scheme" ? "primary" : "ghost"} onPress={() => setCenterMode("scheme")} /></View>
              <View style={{ flex: 1 }}><Button title={`Фото (${photos.length})`} kind={centerMode === "photo" ? "primary" : "ghost"} onPress={() => setCenterMode("photo")} /></View>
            </View>
          ) : null}
          {centerMode === "photo" && shownPhoto ? (
            <Image source={{ uri: shownPhoto.url }} style={{ width: "100%", aspectRatio: 800 / 440, borderRadius: 14, backgroundColor: "#0B0F16" }} resizeMode="contain" />
          ) : (
            <>
              {theme ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}><Button title="Как будет" kind={showStock ? "ghost" : "primary"} onPress={() => setShowStock(false)} /></View>
                  <View style={{ flex: 1 }}><Button title="Как сейчас" kind={showStock ? "primary" : "ghost"} onPress={() => setShowStock(true)} /></View>
                </View>
              ) : null}
              <CabinPreview profile={profile} theme={showStock ? null : theme} title={theme && !showStock ? `${theme.name}${selectedFile?.status === "mockup" ? " (макет)" : ""}` : "Стандартный интерфейс (как сейчас)"} />
            </>
          )}

          <Card>
            <Body style={{ fontWeight: "700" }}>{theme ? theme.name : "Стандартный интерфейс"}</Body>
            {theme ? (
              <>
                <Muted>{theme.summary}</Muted>
                {selectedFile && !selectedFile.fits ? <Badge tone="warn" text={`Не подходит: ${selectedFile.reason}`} /> : null}
                {selectedFile?.status === "ready" ? (
                  <>
                    <Badge tone="good" text="Файл готов" />
                    <Button
                      title="Установить в автомобиль"
                      disabled={!connectedMatches || connection.status !== "ready"}
                      onPress={() => {
                        const pkg = carPackages.find((p) => p.id === selectedFile.packageId);
                        const ecu = liveScan?.ecus.find((e) => e.txId === pkg?.target.txId);
                        if (pkg && ecu) router.push({ pathname: "/cars/install", params: { pkg: pkg.id, version: pkg.version, ecu: ecu.txId } });
                      }}
                    />
                    {!connectedMatches ? (
                      <>
                        <Muted>Для установки подключитесь к этому автомобилю.</Muted>
                        <Button title="Перейти к подключению" kind="ghost" onPress={() => router.push("/")} />
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Badge text="Макет: файла пока нет" />
                    <Muted>Превью показывает, как будет выглядеть интерфейс. Установить можно, когда для этой модели появится пакет.</Muted>
                  </>
                )}
                {selectedFile && car ? (
                  queued ? (
                    <Badge tone="good" text="В очереди: установится при подключении к этому авто" />
                  ) : (
                    <Button
                      title="Подготовить к установке (без адаптера)"
                      kind="ghost"
                      onPress={() => store.enqueue({ carId: car.id, carTitle: `${car.make} ${car.model}`, themeId: selectedFile.theme.id, fileName: selectedFile.fileName, title: selectedFile.theme.name })}
                    />
                  )
                ) : null}
                <Button title="Вернуть стандартный вид" kind="ghost" onPress={() => setThemeId(null)} />
                <Body style={{ fontWeight: "600" }}>Что изменится на экране</Body>
                {theme.changes.map((c) => (
                  <Muted key={c}>• {c}</Muted>
                ))}
                <Row label="Блок автомобиля" value={theme.ecu} />
                <Row label="Что меняется" value={TARGET_TEXT[theme.target]} />
                <Row label="Файл" value={selectedFile?.fileName} mono />
                <Muted>{theme.risk}</Muted>
              </>
            ) : (
              <>
                <Muted>Так экраны выглядят в автомобиле сейчас. Выберите файл интерфейса из списка, и салон покажет результат.</Muted>
                {describeProfile(profile).map((l) => (
                  <Muted key={l}>• {l}</Muted>
                ))}
                <Muted>Состав экранов определён ориентировочно по марке, году и комплектации.</Muted>
              </>
            )}
          </Card>
        </>
      ) : (
        <Empty title="Выберите автомобиль" hint="Найдите модель в поиске: здесь появится салон с экранами, а ниже подробности о каждом файле." />
      )}
    </View>
  );

  // ───────── Справа: поиск и файлы ─────────
  const groups = useMemo(() => {
    const out: { make: string; models: { base: string; cars: Car[] }[] }[] = [];
    for (const c of results) {
      let g = out.find((x) => x.make === c.make);
      if (!g) out.push((g = { make: c.make, models: [] }));
      const b = baseModel(c.model);
      let m = g.models.find((x) => x.base === b);
      if (!m) g.models.push((m = { base: b, cars: [] }));
      m.cars.push(c);
    }
    return out;
  }, [results]);

  const searchCard = (
    <Card>
      <Field label="Поиск автомобиля" value={query} onChangeText={setQuery} placeholder="марка, модель, поколение, год" autoCapitalize="none" />
      {query ? <Button title="Очистить" kind="ghost" onPress={() => setQuery("")} /> : null}
    </Card>
  );

  // Результаты поиска: на широком экране справа, на узком сразу под полем поиска.
  const searchResults = query ? (
    <>
      {results.length === 0 ? (
          <Empty title="Ничего не найдено" hint="Попробуйте название марки или модели, можно по-русски." />
        ) : (
          groups.map((g) => (
            <Card key={g.make}>
              <Body style={{ fontWeight: "800" }}>{g.make}</Body>
              {g.models.map((m) => (
                <View key={m.base} style={{ gap: 4 }}>
                  <Muted style={{ fontWeight: "700" }}>{m.base}</Muted>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {m.cars.map((c) => (
                      <Pressable key={c.id} testID={`gen-${c.id}`} onPress={() => pickCar(c)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: effectiveCarId === c.id ? colors.accent : colors.border, backgroundColor: effectiveCarId === c.id ? colors.cardAlt : "transparent" }}>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>{generationLabel(c) === "—" ? carYears(c) : generationLabel(c)}</Text>
                        {generationLabel(c) === "—" ? null : <Text style={{ color: colors.muted, fontSize: 11 }}>{carYears(c)}</Text>}
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </Card>
          ))
        )}
    </>
  ) : null;

  const sidePanel = (
    <View style={{ gap: 10, width: "100%" }}>
      {wide ? searchCard : null}

      {wide && query ? searchResults : !car ? (
        <>
          <H2>Марки ({ALL_MAKES.length})</H2>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[...ALL_MAKES].sort().map((m) => (
              <Pressable key={m} onPress={() => setQuery(m)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: 13 }}>{m}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {car && profile ? (
        <>
          <H2>Версия автомобиля</H2>
          <Card>
            <Body style={{ fontWeight: "700" }}>{car.make} {car.model}</Body>
            <Muted>Поколение {generationLabel(car)} · {carYears(car)}</Muted>
            <Muted>Комплектация (меняет набор экранов):</Muted>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {TRIMS.map((t) => (
                <View key={t} style={{ flex: 1 }}>
                  <Button title={TRIM_LABEL[t]} kind={trim === t ? "primary" : "ghost"} onPress={() => { setTrim(t); setThemeId(null); }} />
                </View>
              ))}
            </View>
            {describeProfile(profile).map((l) => (
              <Muted key={l}>• {l}</Muted>
            ))}
          </Card>

          <H2>Прошивки блоков</H2>
          {carPackages.filter((p) => p.category !== "interface").length === 0 ? (
            <Card><Muted>Файлов прошивок двигателя и коробки для этой модели пока нет.</Muted></Card>
          ) : (
            carPackages.filter((p) => p.category !== "interface").map((p) => (
              <Card key={p.id}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Badge tone="accent" text={`v${p.version}`} />
                  {p.demo ? <Badge text="Демо" /> : <Badge tone="good" text="Готов" />}
                </View>
                <Body style={{ fontWeight: "600" }}>{p.title}</Body>
                {p.description ? <Muted>{p.description}</Muted> : null}
                <Muted>Устанавливается в блок по Bluetooth на вкладке «Авто и прошивки».</Muted>
              </Card>
            ))
          )}

          <H2>Файлы интерфейса ({files.filter((f) => f.fits).length} из {files.length} подходят)</H2>
          {[...files].sort((a, b) => Number(b.fits) - Number(a.fits)).filter((f) => f.fits || showUnfit || themeId === f.theme.id).map((f) => (
            <FileCard key={f.fileName} file={f} installed={!!f.packageId && installedIds.has(f.packageId)} selected={themeId === f.theme.id} onSelect={() => { setThemeId(f.theme.id); setShowStock(false); setCenterMode("scheme"); if (!wide) scrollRef.current?.scrollTo({ y: 0, animated: true }); }} />
          ))}

          {files.some((f) => !f.fits) ? <Button title={showUnfit ? "Скрыть неподходящие файлы" : `Показать неподходящие (${files.filter((f) => !f.fits).length})`} kind="ghost" onPress={() => setShowUnfit((v) => !v)} /> : null}

          <H2>Как это ставится у марки {car.make}</H2>
          <Card>
            <Body style={{ fontWeight: "700" }}>{installMethodFor(car.make).headline}</Body>
            {installMethodFor(car.make).steps.map((t, i) => <Muted key={t}>{i + 1}. {t}</Muted>)}
            {installMethodFor(car.make).limits.map((t) => <Muted key={t}>• {t}</Muted>)}
            {(installMethodFor(car.make).sources ?? []).map((src) => (
              <Button key={src.url} title={`Источник: ${src.title}`} kind="ghost" onPress={() => void Linking.openURL(src.url)} />
            ))}
            <Muted>{ANDROID_HEADUNIT_NOTE}</Muted>
            <Muted>Сведения собраны из обсуждений владельцев и заметок производителей, на вашей версии ПО могут отличаться.</Muted>
          </Card>

          <H2>Очередь установки ({store.data.queue.length})</H2>
          <Card>
            {store.data.queue.length === 0 ? (
              <Muted>Адаптера пока нет? Выберите файл и нажмите «Подготовить к установке». Он сохранится здесь и предложится, когда вы подключитесь к этому автомобилю по Bluetooth.</Muted>
            ) : (
              store.data.queue.map((q) => (
                <View key={q.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: "600" }}>{q.title}</Body>
                    <Muted>{q.carTitle}</Muted>
                  </View>
                  <Pressable onPress={() => store.dequeue(q.id)}><Text style={{ color: colors.bad, fontSize: 13 }}>Убрать</Text></Pressable>
                </View>
              ))
            )}
          </Card>

          <H2>Где искать настоящие файлы</H2>
          <Card>
            <Muted>Готовых файлов для этой модели в приложении пока нет. Официальные обновления выпускает производитель, а коды изменений экранов обсуждают владельческие форумы. Проверяйте источник, версию блока и отзывы: чужой файл не от вашего блока может его повредить.</Muted>
            <Button title="Официальные обновления и сервис" kind="ghost" onPress={() => void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(`${car.make} ${car.model} software update official`)}`)} />
            <Button title="Кодирование экранов (форумы)" kind="ghost" onPress={() => void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(`${car.make} ${car.model} cluster infotainment coding display options`)}`)} />
            <Button title="Фото салона" kind="ghost" onPress={() => void Linking.openURL(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${car.make} ${car.model} interior dashboard`)}`)} />
          </Card>

          <H2>Фото и видео салона</H2>
          <Card>
            <Muted>Прикрепите свои фото салона и ссылки на видео этого автомобиля: фото можно открыть в центре вместо схемы.</Muted>
            <Button title="Добавить фото" kind="ghost" onPress={() => void addPhoto()} />
            <Field label="Ссылка на видео или фото" value={linkText} onChangeText={setLinkText} placeholder="https://..." autoCapitalize="none" />
            <Button title="Добавить ссылку" kind="ghost" onPress={addLink} disabled={!linkText.trim()} />
            {message ? <Body style={{ color: colors.warn }}>{message}</Body> : null}
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {media.map((m) =>
                m.kind === "image" ? (
                  <Pressable key={m.id} onPress={() => { setPhotoId(m.id); setCenterMode("photo"); }}>
                    <Image source={{ uri: m.url }} style={{ width: 96, height: 64, borderRadius: 8 }} />
                  </Pressable>
                ) : (
                  <Pressable key={m.id} onPress={() => void Linking.openURL(m.url)} style={{ width: 96, height: 64, borderRadius: 8, backgroundColor: colors.cardAlt, padding: 6, justifyContent: "center" }}>
                    <Text style={{ color: colors.accent, fontSize: 11 }} numberOfLines={3}>▶ {m.title}</Text>
                  </Pressable>
                ),
              )}
            </ScrollView>
            {media.length > 0 ? (
              <Pressable onPress={() => media.forEach((m) => store.removeMedia(car.id, m.id))}><Text style={{ color: colors.bad, fontSize: 13 }}>Удалить все материалы</Text></Pressable>
            ) : null}
          </Card>
        </>
      ) : null}
    </View>
  );

  // Широкий экран: салон по центру всегда на месте, список справа прокручивается отдельно.
  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}>
        <ScrollView style={{ flex: 1, minWidth: 380 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {centerPanel}
        </ScrollView>
        <ScrollView style={{ flexGrow: 0, flexShrink: 0, width: 372, borderLeftWidth: 1, borderLeftColor: colors.border }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {sidePanel}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
      {searchCard}
      {searchResults}
      {centerPanel}
      {sidePanel}
    </ScrollView>
  );
}

function FileCard({ file, selected, installed, onSelect }: { file: InterfaceFile; selected: boolean; installed: boolean; onSelect: () => void }) {
  return (
    <Pressable testID={`file-${file.theme.id}`} onPress={onSelect} disabled={false}>
      <Card style={{ borderColor: selected ? colors.accent : colors.border, opacity: file.fits ? 1 : 0.6 }}>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <Badge tone="accent" text={TARGET_TEXT[file.theme.target]} />
          {file.status === "ready" ? <Badge tone="good" text="Файл готов" /> : <Badge text="Макет" />}
          {installed ? <Badge tone="good" text="Установлено в этот автомобиль" /> : null}
          {!file.fits ? <Badge tone="warn" text="Не подходит" /> : null}
        </View>
        <Body style={{ fontWeight: "700" }}>{file.theme.name}</Body>
        <Muted>{file.theme.summary}</Muted>
        <Muted style={{ fontFamily: "monospace", fontSize: 11 }}>{file.fileName}</Muted>
        {!file.fits && file.reason ? <Muted>{file.reason}</Muted> : null}
      </Card>
    </Pressable>
  );
}
