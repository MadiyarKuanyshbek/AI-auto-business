import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useState } from "react";
import { Platform, Share, Switch, View } from "react-native";
import { LEGAL_NOTICE, parseCatalog } from "../../core/catalog";
import { dtcCount } from "../../core/dtc";
import { buildReportHtml, buildReportText } from "../../core/report";
import { useSession } from "../../session";
import { useStore } from "../../storage/store";
import { desktopBridge } from "../../transport/desktop";
import { Body, Button, Card, Field, H2, Muted, Row, Screen } from "../../ui/kit";
import { printHtml } from "../../ui/print";

export default function SettingsScreen() {
  const store = useStore();
  const { settings } = store.data;
  const { scan, catalog, exchangeLog, connection } = useSession();
  const [catalogText, setCatalogText] = useState("");
  const [catalogMsg, setCatalogMsg] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [restoreText, setRestoreText] = useState("");

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

  async function backupNow() {
    const json = store.exportJson();
    const bridge = desktopBridge();
    try {
      if (bridge) {
        const file = await bridge.backup.save(json);
        setBackupMsg(`Копия сохранена: ${file}`);
      } else if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `autoflash-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setBackupMsg("Копия скачана.");
      } else {
        await Share.share({ message: json });
        setBackupMsg("Копия отправлена.");
      }
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : "Не удалось сохранить копию");
    }
  }

  async function restoreFromFile() {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
    setBackupMsg(store.importJson(text) ? "Данные восстановлены из копии." : "Это не копия AutoFlash.");
  }

  const log = exchangeLog();

  return (
    <Screen>
      <H2>Мастерская</H2>
      <Card>
        <Field label="Название (в отчётах и квитанциях)" value={settings.workshopName} onChangeText={(v) => store.updateSettings({ workshopName: v })} />
        <Field label="Телефон" value={settings.workshopPhone} onChangeText={(v) => store.updateSettings({ workshopPhone: v })} keyboardType="phone-pad" />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Switch value={settings.showDemo} onValueChange={(v) => store.updateSettings({ showDemo: v })} />
          <Body style={{ flex: 1 }}>Показывать демо-автомобили и демо-позиции каталога (выключается само после первого скана настоящего авто)</Body>
        </View>
      </Card>

      <H2>Отчёт</H2>
      <Button title="Поделиться отчётом о последнем сканировании" onPress={() => scan && void Share.share({ message: buildReportText(scan) })} disabled={!scan} />
      {Platform.OS === "web" ? (
        <Button title="Распечатать / сохранить в PDF" kind="ghost" onPress={() => scan && void printHtml(buildReportHtml(scan, settings.workshopName || "AutoFlash"), buildReportText(scan))} disabled={!scan} />
      ) : null}

      <H2>Резервные копии</H2>
      <Card>
        <Muted>
          Данные хранятся только на этом устройстве. {desktopBridge() ? "Копия создаётся автоматически раз в день в «Документы\\AutoFlash\\Backups» (хранятся последние 30)." : "Сохраняйте копию вручную."}
        </Muted>
        <Button title="Сохранить копию сейчас" onPress={() => void backupNow()} />
        {desktopBridge() ? <Button title="Открыть папку с копиями" kind="ghost" onPress={() => void desktopBridge()?.backup.openFolder()} /> : null}
        <Button title="Восстановить из файла копии" kind="ghost" onPress={() => void restoreFromFile()} />
        <Field label="Или вставьте содержимое копии" value={restoreText} onChangeText={setRestoreText} multiline autoCapitalize="none" />
        <Button
          title="Восстановить из вставленного текста"
          kind="ghost"
          disabled={!restoreText.trim()}
          onPress={() => {
            setBackupMsg(store.importJson(restoreText) ? "Данные восстановлены из копии." : "Это не копия AutoFlash.");
            setRestoreText("");
          }}
        />
        {backupMsg ? <Body>{backupMsg}</Body> : null}
      </Card>

      <H2>Каталог прошивок</H2>
      <Card>
        <Row label="Позиций в каталоге" value={catalog.length} />
        <Muted>Свои позиции вставьте JSON-массивом (id, title, category, status, compat, fileSha256…).</Muted>
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

      <H2>Справочник ошибок</H2>
      <Card>
        <Muted>{dtcCount()} точных описаний стандартных кодов; для остальных показывается категория (например, «Коробка передач» или «код производителя»).</Muted>
      </Card>

      <H2>Правовая информация</H2>
      <Card tone="warn"><Muted>{LEGAL_NOTICE}</Muted></Card>

      <H2>Данные</H2>
      <Card>
        <Muted>Клиентов: {store.data.customers.length} · авто: {store.data.vehicles.length} · заказов: {store.data.jobs.length}.</Muted>
        {confirmReset ? (
          <>
            <Body>Удалить все данные приложения без возможности восстановления? Сначала сохраните копию.</Body>
            <Button title="Да, удалить всё" kind="danger" onPress={() => { store.resetAll(); setConfirmReset(false); }} />
            <Button title="Отмена" kind="ghost" onPress={() => setConfirmReset(false)} />
          </>
        ) : (
          <Button title="Удалить все данные" kind="ghost" onPress={() => setConfirmReset(true)} />
        )}
      </Card>
      <Muted>AutoFlash 0.2</Muted>
    </Screen>
  );
}
