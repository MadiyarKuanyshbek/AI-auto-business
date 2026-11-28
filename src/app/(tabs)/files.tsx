import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { matchScannedCar } from "../../core/cars";
import { parseCodingPackage } from "../../core/coding";
import { TRUST_TEXT, buildQueries, classifyUrl, extVerdict, type SearchKind } from "../../core/finder";
import { fitApk, fitCoding, fitFirmware, type CarRef, type Fit } from "../../core/fit";
import { parsePackage } from "../../core/package";
import { resolveModelYear } from "../../core/vin";
import { logEvent } from "../../liveLog";
import { useSession } from "../../session";
import { vehicleTitle, type FileLogEntry } from "../../storage/model";
import { useStore } from "../../storage/store";
import { desktopBridge, type QuarantineItem } from "../../transport/desktop";
import { Badge, Body, Button, Card, Field, H1, H2, Muted, Screen, colors } from "../../ui/kit";

const KINDS: { id: SearchKind; label: string; log: FileLogEntry["kind"] }[] = [
  { id: "firmware", label: "Прошивка / кодирование", log: "firmware" },
  { id: "russify", label: "Русификация", log: "apk" },
  { id: "apps", label: "Приложения", log: "apk" },
  { id: "headunit", label: "Обновление магнитолы", log: "headunit" },
];

const TRUST_TONE = { official: "good", store: "accent", community: "warn", filehost: "bad", unknown: "bad" } as const;
const FIT_TONE = { ok: "good", warn: "warn", bad: "bad", unknown: "muted" } as const;
const DEFENDER_TEXT = { clean: "Антивирус: угроз не найдено", threat: "Антивирус: НАЙДЕНА УГРОЗА", unavailable: "Антивирус недоступен", error: "Антивирус не смог проверить", skipped: "Не проверялся" } as const;
const TYPE_TEXT = { apk: "Приложение Android (.apk)", zip: "Архив (.zip)", pdf: "Документ (.pdf)", json: "Текстовый пакет (json / afpkg)", bin: "Тип не определён (возможно, образ прошивки)", exe: "Программа Windows", elf: "Исполняемый файл" } as const;
const ACTION_TEXT: Record<FileLogEntry["action"], string> = { downloaded: "Скачано в карантин", accepted: "Принято в библиотеку", rejected: "Отклонено", installed: "Установлено", restored: "Возвращено из копии", uninstalled: "Удалено с магнитолы" };
const KIND_TEXT: Record<FileLogEntry["kind"], string> = { firmware: "Прошивка", coding: "Кодирование", apk: "Приложение", headunit: "Обновление магнитолы", other: "Файл" };
const mb = (n: number) => `${(n / 1048576).toFixed(1)} МБ`;
const when = (t: number) => new Date(t).toLocaleString("ru-RU");

type Section = "search" | "quarantine" | "log" | "sources";

/**
 * Отдельная вкладка поиска файлов. Работает сама по себе и не трогает адаптер: поиск, скачивание, проверка и журнал
 * идут в отдельном процессе, поэтому не мешают подключению, прошивке и кодированию. Ничего не устанавливается без подтверждения.
 */
export default function FilesTab() {
  const bridge = desktopBridge();
  const store = useStore();
  const { liveScan } = useSession();
  const { fileLog, sourceRatings, headUnits } = store.data;

  const car = useMemo(() => {
    if (!liveScan) return null;
    const make = liveScan.vinOnline?.make ?? liveScan.vinInfo?.make ?? "";
    const year = resolveModelYear(liveScan.vinInfo, liveScan.vinOnline);
    const m = matchScannedCar(make, liveScan.vinOnline?.model, year)[0];
    return { make: m?.make ?? make, model: m?.model ?? liveScan.vinOnline?.model ?? "", year };
  }, [liveScan]);

  const [section, setSection] = useState<Section>("search");
  const [kind, setKind] = useState<SearchKind>("russify");
  const [make, setMake] = useState(car?.make ?? "");
  const [model, setModel] = useState(car?.model ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ title: string; url: string; snippet: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directUrl, setDirectUrl] = useState("");
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [fits, setFits] = useState<Record<string, { fit: Fit; about?: string }>>({});

  const carRef: CarRef | null = make.trim() ? { make: make.trim(), model: model.trim(), year: car?.year ?? null } : null;
  const suggested = useMemo(() => (make.trim() ? buildQueries(kind, { make: make.trim(), model: model.trim(), year: car?.year ?? null }) : []), [kind, make, model, car]);
  const logKind = KINDS.find((k) => k.id === kind)?.log ?? "other";
  const carLog = (): FileLogEntry["car"] => (liveScan ? { title: vehicleTitle(liveScan), vin: liveScan.vin ?? "" } : make.trim() ? { title: [make.trim(), model.trim()].filter(Boolean).join(" "), vin: "" } : undefined);
  const headAbi = (headUnits.find((h) => liveScan && h.vin === (liveScan.vin ?? "")) ?? headUnits[0])?.props["ro.product.cpu.abi"];

  useEffect(() => {
    if (!bridge) return;
    const t = setTimeout(() => void bridge.finder.list().then(setItems), 100);
    return () => clearTimeout(t);
  }, [bridge, section]);

  // Для каждого файла в карантине считаем, подходит ли он выбранной машине.
  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    (async () => {
      const next: Record<string, { fit: Fit; about?: string }> = {};
      for (const it of items) {
        if (it.type === "apk") next[it.id] = { fit: fitApk(it.abis ?? [], headAbi), about: it.abis?.length ? `Собрано под: ${it.abis.join(", ")}` : "Своих библиотек нет" };
        else if (it.type === "json") {
          const text = await bridge.finder.readText(it.id);
          let raw: unknown = null;
          try {
            raw = text ? JSON.parse(text) : null;
          } catch {
            raw = null;
          }
          const fw = raw ? parsePackage(raw) : null;
          const cod = raw ? parseCodingPackage(raw) : null;
          if (fw?.ok) next[it.id] = { fit: fitFirmware(fw.pkg, carRef), about: `Пакет прошивки «${fw.pkg.title}» v${fw.pkg.version}` };
          else if (cod?.ok) next[it.id] = { fit: fitCoding(cod.pkg, liveScan?.ecus ?? null, carRef), about: `Пакет кодирования «${cod.pkg.title}»` };
          else next[it.id] = { fit: { level: "bad", text: "Файл не читается как пакет AutoFlash (прошивки или кодирования): принять его нельзя." } };
        } else if (it.type === "bin" || it.type === "zip") next[it.id] = { fit: { level: "warn", text: "Содержимое приложение понять не может: напрямую ни ставить, ни записывать его нельзя. Нужен пакет формата AutoFlash." } };
      }
      if (alive) setFits(next);
    })();
    return () => {
      alive = false;
    };
    // carRef меняется вместе с make, model и liveScan, которые перечислены ниже
  }, [bridge, items, headAbi, liveScan, make, model, car]);

  if (!bridge) {
    return (
      <Screen>
        <H1>Поиск файлов</H1>
        <Card>
          <Body>Эта вкладка работает только в настольной программе AutoFlash для Windows.</Body>
        </Card>
      </Screen>
    );
  }

  const domainOf = (url: string) => classifyUrl(url).host;
  const rated = (url: string) => sourceRatings[domainOf(url)];
  const rank = (url: string) => {
    const a = classifyUrl(url);
    const base = { official: 0, store: 1, community: 3, filehost: 4, unknown: 4 }[a.trust];
    return rated(url) === "good" ? Math.min(base, 1) - 0.5 : base;
  };

  async function search(q: string) {
    setQuery(q);
    setSearching(true);
    setError(null);
    setResults([]);
    logEvent(`Поиск файлов: ${q}`);
    const r = await bridge!.finder.search(q);
    setSearching(false);
    if (r.ok) setResults(r.results.filter((x) => rated(x.url) !== "bad").sort((a, b) => rank(a.url) - rank(b.url)));
    else setError(r.error ?? "Не удалось выполнить поиск");
  }

  async function download(url: string) {
    setBusyUrl(url);
    setMessage(null);
    logEvent(`Карантин: скачиваю ${url}`);
    const r = await bridge!.finder.download(url);
    setBusyUrl(null);
    if (r.ok) {
      store.addFileLog({ kind: logKind, action: "downloaded", name: r.item.name, source: r.item.sourceUrl, sha256: r.item.sha256, size: r.item.size, car: carLog(), note: r.item.blocked ? `Заблокирован проверкой: ${r.item.warnings[0] ?? ""}` : `Тип: ${TYPE_TEXT[r.item.type]}; ${DEFENDER_TEXT[r.item.defender]}` });
      setMessage({ ok: !r.item.blocked, text: r.item.blocked ? `Файл ${r.item.name} заблокирован проверкой: ${r.item.warnings[0] ?? ""}` : `Файл ${r.item.name} скачан в карантин. Проверьте результаты и примите, если всё в порядке.` });
      setItems(await bridge!.finder.list());
      setSection("quarantine");
    } else setMessage({ ok: false, text: r.error });
  }

  async function accept(item: QuarantineItem) {
    const r = await bridge!.finder.accept(item.id);
    if (!r.ok) return setMessage({ ok: false, text: r.error });
    const entry = { name: item.name, source: item.sourceUrl, sha256: item.sha256, size: item.size, car: carLog() };
    if (r.kind === "apk") {
      store.addFileLog({ ...entry, kind: "apk", action: "accepted", note: "Приложение в библиотеке приложений" });
      store.rateSource(domainOf(item.sourceUrl), sourceRatings[domainOf(item.sourceUrl)] ?? "good");
      setMessage({ ok: true, text: `Приложение принято в библиотеку: ${r.dest}. Установить можно в разделе «Приложения и русификация».` });
    } else {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(r.text);
      } catch {
        parsed = null;
      }
      const res = parsed ? store.addPackage(parsed) : ({ ok: false, error: "Файл не читается как пакет AutoFlash" } as const);
      if (res.ok) {
        store.addFileLog({ ...entry, kind: (parsed as { format?: string }).format === "autoflash-coding" ? "coding" : "firmware", action: "accepted", note: `Пакет в библиотеке: ${res.title}` });
        await bridge!.finder.remove(item.id);
        setMessage({ ok: true, text: `Пакет принят в библиотеку: ${res.title}` });
      } else setMessage({ ok: false, text: `Пакет не принят: ${res.error}` });
    }
    setItems(await bridge!.finder.list());
  }

  async function reject(item: QuarantineItem) {
    store.addFileLog({ kind: "other", action: "rejected", name: item.name, source: item.sourceUrl, sha256: item.sha256, size: item.size, car: carLog(), note: "Удалён из карантина" });
    await bridge!.finder.remove(item.id);
    setItems(await bridge!.finder.list());
  }

  async function exportLog() {
    const csv = ["Дата;Действие;Тип;Файл;Источник;Машина;VIN;SHA-256;Примечание", ...fileLog.map((f) => [when(f.at), ACTION_TEXT[f.action], KIND_TEXT[f.kind], f.name, f.source ?? "", f.car?.title ?? "", f.car?.vin ?? "", f.sha256 ?? "", f.note ?? ""].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";"))].join("\n");
    const file = await bridge!.files.saveText(csv, "Журнал файлов", "csv");
    setMessage({ ok: true, text: `Журнал сохранён: ${file}` });
  }

  const pills: [Section, string][] = [["search", "Поиск"], ["quarantine", `Карантин (${items.length})`], ["log", `Журнал (${fileLog.length})`], ["sources", "Источники"]];
  const domains = Object.entries(sourceRatings);

  return (
    <Screen>
      <H1>Поиск файлов</H1>
      <Muted>Ищет прошивки, кодирование, русификацию и приложения, проверяет их, подходят ли они вашей машине, и записывает, откуда что скачано. Работает отдельно от подключения к машине и ничего не ставит сам.</Muted>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {pills.map(([key, label]) => (
          <Pressable key={key} testID={`files-${key}`} onPress={() => setSection(key)} style={{ flexGrow: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", backgroundColor: section === key ? colors.accent : colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {message ? <Badge tone={message.ok ? "good" : "bad"} text={message.text} /> : null}

      {section === "search" ? (
        <>
          <Card>
            <Body style={{ fontWeight: "700" }}>Как это работает</Body>
            <Muted>1. Поиск по марке и модели (VIN не отправляется), результаты помечены по источнику.</Muted>
            <Muted>2. «Скачать на проверку»: файл в карантин, тип по содержимому, SHA-256, антивирус Windows, проверка «подойдёт ли». Программы (.exe и подобные) блокируются.</Muted>
            <Muted>3. «Принять»: приложение в библиотеку, пакет AutoFlash в библиотеку пакетов. Установка потом идёт обычным путём со всеми подтверждениями и сохранением оригинала.</Muted>
            <Muted>Образ прошивки чужого формата приложение само не записывает: нужен пакет AutoFlash, иначе можно испортить блок.</Muted>
          </Card>
          <Card>
            <Muted>{car ? `Подключена машина: ${vehicleTitle(liveScan!)}.` : "Машина не подключена: укажите марку и модель."}</Muted>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {KINDS.map((k) => (
                <Pressable key={k.id} onPress={() => setKind(k.id)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: kind === k.id ? colors.accent : colors.card, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{k.label}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Марка" value={make} onChangeText={setMake} placeholder="например: Chery" autoCapitalize="none" />
            <Field label="Модель" value={model} onChangeText={setModel} placeholder="например: Tiggo 8" autoCapitalize="none" />
            {suggested.map((q) => (
              <Button key={q} title={searching && query === q ? "Ищу…" : q} kind="ghost" disabled={searching} onPress={() => void search(q)} />
            ))}
            {error ? (
              <>
                <Badge tone="bad" text={error} />
                {query ? <Button title="Открыть этот поиск в браузере" kind="ghost" onPress={() => void bridge.finder.openUrl(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`)} /> : null}
              </>
            ) : null}
            {results.map((r) => {
              const a = classifyUrl(r.url);
              const path = (() => {
                try {
                  return new URL(r.url).pathname;
                } catch {
                  return "";
                }
              })();
              const direct = extVerdict(decodeURIComponent(path.split("/").pop() ?? ""));
              const looksLikeFile = /\.\w{2,5}$/.test(path) && direct.ok && !["html", "htm", "php", "aspx"].includes(direct.ext);
              const rating = rated(r.url);
              return (
                <View key={r.url} style={{ gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Body style={{ fontWeight: "700" }}>{r.title || r.url}</Body>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    <Badge tone={TRUST_TONE[a.trust]} text={`${TRUST_TEXT[a.trust]} · ${a.host}`} />
                    {rating === "good" ? <Badge tone="good" text="Вы отметили источник надёжным" /> : null}
                  </View>
                  {r.snippet ? <Muted>{r.snippet}</Muted> : null}
                  <Muted>{a.advice}</Muted>
                  <Button title="Открыть в браузере" kind="ghost" onPress={() => void bridge.finder.openUrl(r.url)} />
                  {looksLikeFile ? <Button title={busyUrl === r.url ? "Скачиваю…" : "Скачать на проверку"} kind="ghost" disabled={busyUrl !== null} onPress={() => void download(r.url)} /> : null}
                  <Button title="Отметить источник плохим (скрыть)" kind="ghost" onPress={() => { store.rateSource(a.host, "bad"); setResults((l) => l.filter((x) => domainOf(x.url) !== a.host)); }} />
                </View>
              );
            })}
          </Card>
          <Card>
            <Body style={{ fontWeight: "700" }}>Скачать по прямой ссылке</Body>
            <Muted>Если у вас есть ссылка на файл (от дилера, производителя, разработчика), вставьте её. Только https.</Muted>
            <Field label="Ссылка на файл" value={directUrl} onChangeText={setDirectUrl} placeholder="https://…" autoCapitalize="none" />
            {directUrl.startsWith("https://") ? <Muted>{`${TRUST_TEXT[classifyUrl(directUrl).trust]}. ${classifyUrl(directUrl).advice}`}</Muted> : null}
            <Button title={busyUrl === directUrl ? "Скачиваю…" : "Скачать в карантин и проверить"} disabled={busyUrl !== null || !directUrl.startsWith("https://")} onPress={() => void download(directUrl)} />
          </Card>
        </>
      ) : null}

      {section === "quarantine" ? (
        <>
          {items.length === 0 ? (
            <Card>
              <Muted>Карантин пуст. Скачанные файлы появятся здесь с результатами проверки.</Muted>
            </Card>
          ) : null}
          {items.map((it) => {
            const f = fits[it.id];
            return (
              <Card key={it.id} tone={it.blocked ? "bad" : it.warnings.length ? "warn" : "good"}>
                <Body style={{ fontWeight: "700" }}>{it.name}</Body>
                <Muted>{TYPE_TEXT[it.type]} · {mb(it.size)}</Muted>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <Badge tone={it.defender === "clean" ? "good" : it.defender === "threat" ? "bad" : "warn"} text={DEFENDER_TEXT[it.defender]} />
                  <Badge text={`SHA-256 ${it.sha256.slice(0, 12)}…`} />
                </View>
                <Muted>Источник: {it.sourceUrl === "local" ? "локальный файл" : it.sourceUrl}</Muted>
                {f ? (
                  <>
                    {f.about ? <Muted>{f.about}</Muted> : null}
                    <Badge tone={FIT_TONE[f.fit.level]} text={f.fit.level === "ok" ? "Подходит" : f.fit.level === "bad" ? "Не подходит" : f.fit.level === "warn" ? "Проверьте" : "Пока неизвестно"} />
                    <Muted>{f.fit.text}</Muted>
                  </>
                ) : null}
                {it.warnings.map((w) => (
                  <Muted key={w}>• {w}</Muted>
                ))}
                <Button title="Принять в библиотеку" disabled={it.blocked || f?.fit.level === "bad"} onPress={() => void accept(it)} />
                {it.sourceUrl !== "local" ? (
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <View style={{ flexGrow: 1 }}><Button title="👍 Источник надёжный" kind="ghost" onPress={() => store.rateSource(domainOf(it.sourceUrl), "good")} /></View>
                    <View style={{ flexGrow: 1 }}><Button title="👎 Источник плохой" kind="ghost" onPress={() => store.rateSource(domainOf(it.sourceUrl), "bad")} /></View>
                  </View>
                ) : null}
                <Button title="Удалить из карантина" kind="ghost" onPress={() => void reject(it)} />
              </Card>
            );
          })}
        </>
      ) : null}

      {section === "log" ? (
        <>
          <Muted>Здесь записано всё: что найдено и скачано, откуда, для какой машины, что принято и что установлено. Записи не удаляются приложением.</Muted>
          {fileLog.length > 0 ? <Button title="Сохранить журнал в файл (CSV для Excel)" kind="ghost" onPress={() => void exportLog()} /> : null}
          {fileLog.length === 0 ? (
            <Card>
              <Muted>Пока пусто. Записи появятся при скачивании, приёме и установке файлов.</Muted>
            </Card>
          ) : null}
          {fileLog.map((f) => (
            <Card key={f.id}>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                <Badge tone={f.action === "installed" || f.action === "restored" ? "good" : f.action === "rejected" ? "bad" : "accent"} text={ACTION_TEXT[f.action]} />
                <Badge text={KIND_TEXT[f.kind]} />
              </View>
              <Body style={{ fontWeight: "700" }}>{f.name}</Body>
              <Muted>{when(f.at)}{f.car ? ` · для: ${f.car.title}` : ""}</Muted>
              {f.source && f.source !== "local" ? <Muted>Откуда: {f.source}</Muted> : null}
              {f.sha256 ? <Muted>SHA-256: {f.sha256.slice(0, 16)}…{f.size ? ` · ${mb(f.size)}` : ""}</Muted> : null}
              {f.note ? <Muted>{f.note}</Muted> : null}
            </Card>
          ))}
        </>
      ) : null}

      {section === "sources" ? (
        <>
          <Muted>Приложение запоминает ваши оценки источников: надёжные поднимаются в результатах поиска, плохие скрываются. Так поиск со временем становится точнее.</Muted>
          {domains.length === 0 ? (
            <Card>
              <Muted>Оценок пока нет. Отмечайте источники в результатах поиска и в карантине.</Muted>
            </Card>
          ) : null}
          {domains.map(([d, r]) => (
            <Card key={d}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tone={r === "good" ? "good" : "bad"} text={r === "good" ? "Надёжный" : "Плохой"} />
                <Body style={{ flex: 1, fontWeight: "600" }}>{d}</Body>
              </View>
              <Button title="Снять оценку" kind="ghost" onPress={() => store.rateSource(d, null)} />
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
