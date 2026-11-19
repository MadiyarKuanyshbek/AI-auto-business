import { useState } from "react";
import { Platform, Share } from "react-native";
import { LEGAL_NOTICE, parseCatalog } from "../../core/catalog";
import { buildReportHtml, buildReportText } from "../../core/report";
import { useSession } from "../../session";
import { useStore } from "../../storage/store";
import { Body, Button, Card, Field, H2, Muted, Row, Screen } from "../../ui/kit";

export default function SettingsScreen() {
  const store = useStore();
  const { scan, catalog, exchangeLog, connection } = useSession();
  const [catalogText, setCatalogText] = useState("");
  const [catalogMsg, setCatalogMsg] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  function importCatalog() {
    try {
      const items = parseCatalog(JSON.parse(catalogText));
      if (items.length === 0) return setCatalogMsg("В JSON не найдено ни одной корректной позиции.");
      store.setCatalogJson(items);
      setCatalogMsg(`Загружено позиций: ${items.length}`);
      setCatalogText("");
    } catch {
      setCatalogMsg("Это не корректный JSON.");
    }
  }

  async function shareReport() {
    if (!scan) return;
    await Share.share({ message: buildReportText(scan) });
  }

  function printReport() {
    if (!scan || Platform.OS !== "web") return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildReportHtml(scan));
    w.document.close();
    w.focus();
    w.print();
  }

  const log = exchangeLog();

  return (
    <Screen>
      <H2>Отчёт</H2>
      <Button title="Поделиться отчётом о последнем сканировании" onPress={() => void shareReport()} disabled={!scan} />
      {Platform.OS === "web" ? <Button title="Распечатать / сохранить в PDF" kind="ghost" onPress={printReport} disabled={!scan} /> : null}

      <H2>Каталог прошивок</H2>
      <Card>
        <Row label="Позиций в каталоге" value={catalog.length} />
        <Muted>Демо-позиции встроены. Свои позиции вставьте JSON-массивом (id, title, category, status, compat, fileSha256…).</Muted>
        <Field label="JSON каталога" value={catalogText} onChangeText={setCatalogText} multiline autoCapitalize="none" />
        <Button title="Загрузить" kind="ghost" onPress={importCatalog} disabled={!catalogText.trim()} />
        {catalogMsg ? <Body>{catalogMsg}</Body> : null}
      </Card>

      <H2>Журнал обмена с адаптером</H2>
      <Card>
        <Muted>Подключение: {connection.status === "ready" ? connection.label : connection.status}</Muted>
        <Button title={showLog ? "Скрыть" : `Показать (${log.length})`} kind="ghost" onPress={() => setShowLog((v) => !v)} />
        {showLog
          ? log.slice(-80).map((l, i) => (
              <Muted key={i} style={{ fontFamily: "monospace", fontSize: 11 }}>
                {l.dir === "tx" ? "→" : "←"} {l.text.replace(/\s+/g, " ").slice(0, 160)}
              </Muted>
            ))
          : null}
      </Card>

      <H2>Правовая информация</H2>
      <Card tone="warn"><Muted>{LEGAL_NOTICE}</Muted></Card>

      <H2>Данные</H2>
      <Card>
        <Muted>Клиентов: {store.data.customers.length} · авто: {store.data.vehicles.length} · заказов: {store.data.jobs.length}. Данные хранятся только на этом устройстве.</Muted>
        {confirmReset ? (
          <>
            <Body>Удалить все данные приложения без возможности восстановления?</Body>
            <Button title="Да, удалить всё" kind="danger" onPress={() => { store.resetAll(); setConfirmReset(false); }} />
            <Button title="Отмена" kind="ghost" onPress={() => setConfirmReset(false)} />
          </>
        ) : (
          <Button title="Удалить все данные" kind="ghost" onPress={() => setConfirmReset(true)} />
        )}
      </Card>
      <Muted>AutoFlash 0.1</Muted>
    </Screen>
  );
}
