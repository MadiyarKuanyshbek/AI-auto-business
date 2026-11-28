import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { useStore } from "../storage/store";
import { desktopBridge } from "../transport/desktop";
import { Badge, Body, Button, Card, H2, Muted } from "./kit";

/** Резервные копии данных: в файл, в облачную папку (OneDrive, Google Drive, Dropbox) и обратно. */
export function BackupCard() {
  const store = useStore();
  const bridge = desktopBridge();
  const [mirror, setMirror] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!bridge) return;
    const t = setTimeout(() => void bridge.backup.getMirror().then(setMirror), 100);
    return () => clearTimeout(t);
  }, [bridge]);

  if (!bridge) {
    // В браузере и на телефоне копию можно только скопировать текстом.
    return Platform.OS === "web" ? null : null;
  }

  async function saveFile() {
    const file = await bridge!.backup.saveAs(store.exportJson());
    if (file) setMessage({ ok: true, text: `Копия сохранена: ${file}` });
  }

  async function loadFile() {
    const text = await bridge!.backup.load();
    if (text === null) return;
    const ok = store.importJson(text);
    setMessage(ok ? { ok: true, text: "Копия загружена: данные заменены содержимым файла." } : { ok: false, text: "Это не копия AutoFlash, данные не изменены." });
  }

  async function chooseMirror() {
    const dir = await bridge!.backup.chooseMirror();
    if (dir) {
      setMirror(dir);
      setMessage({ ok: true, text: `Ежедневные копии будут дублироваться в ${dir}` });
    }
  }

  async function clearMirror() {
    await bridge!.backup.clearMirror();
    setMirror(null);
    setMessage({ ok: true, text: "Дублирование отключено." });
  }

  return (
    <>
      <H2>Резервные копии</H2>
      <Card>
        <Muted>Все данные (автомобили, пакеты, фото, установки) хранятся на этом компьютере. Раз в день копия пишется в «Документы\AutoFlash\Backups». Чтобы данные пережили поломку компьютера, дублируйте копии в папку облака или на другой диск.</Muted>
        <Body style={{ fontWeight: "700" }}>Дополнительная папка для копий</Body>
        {mirror ? <Badge tone="good" text={mirror} /> : <Muted>Не выбрана.</Muted>}
        <View style={{ gap: 8 }}>
          <Button title={mirror ? "Выбрать другую папку (облако или диск)" : "Выбрать папку (например, OneDrive)"} kind="ghost" onPress={() => void chooseMirror()} />
          {mirror ? <Button title="Отключить дублирование" kind="ghost" onPress={() => void clearMirror()} /> : null}
          <Button title="Сохранить копию в файл…" kind="ghost" onPress={() => void saveFile()} />
          <Button title="Загрузить копию из файла…" kind="ghost" onPress={() => void loadFile()} />
          <Button title="Открыть папку с автоматическими копиями" kind="ghost" onPress={() => void bridge!.backup.openFolder()} />
        </View>
        {message ? <Badge tone={message.ok ? "good" : "bad"} text={message.text} /> : null}
      </Card>
    </>
  );
}
