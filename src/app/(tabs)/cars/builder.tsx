import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useState } from "react";
import { Platform, Pressable, Switch, Text, View } from "react-native";
import { SECURITY_ALGORITHMS } from "../../../core/package";
import { EMPTY_FORM, buildPackageFromForm, type BuilderForm } from "../../../core/packageBuilder";
import { THEMES } from "../../../core/interfaces";
import { sha256Hex } from "../../../core/sha256";
import { useSession } from "../../../session";
import { useStore } from "../../../storage/store";
import { Badge, Body, Button, Card, Field, H2, Muted, Screen, colors } from "../../../ui/kit";

const CATEGORIES: { id: BuilderForm["category"]; label: string }[] = [
  { id: "engine", label: "Двигатель" },
  { id: "transmission", label: "Коробка" },
  { id: "interface", label: "Интерфейс" },
  { id: "other", label: "Другое" },
];

export default function BuilderScreen() {
  const store = useStore();
  const { liveScan } = useSession();
  const [form, setForm] = useState<BuilderForm>(EMPTY_FORM);
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const buf = asset.file ? await asset.file.arrayBuffer() : await new File(asset.uri).arrayBuffer();
    set("data", new Uint8Array(buf));
    setFileName(asset.name);
  }

  function fromEcu(txId: string, rxIdSw: string) {
    setForm((f) => ({ ...f, txId, targetSoftware: rxIdSw }));
  }

  function build() {
    const r = buildPackageFromForm(form);
    if (!r.ok) return setMessage({ ok: false, text: r.error });
    const added = store.addPackage(r.pkg);
    if (!added.ok) return setMessage({ ok: false, text: added.error });
    setMessage({ ok: true, text: `Пакет создан и добавлен в библиотеку: ${added.title}` });
    if (Platform.OS === "web") {
      const url = URL.createObjectURL(new Blob([JSON.stringify(r.pkg)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.pkg.id}-${r.pkg.version}.afpkg`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const row = (label: string, key: keyof BuilderForm, placeholder?: string) => (
    <Field label={label} value={String(form[key] ?? "")} onChangeText={(v) => set(key, v as never)} placeholder={placeholder} autoCapitalize="none" />
  );

  return (
    <Screen>
      <H2>Конструктор пакета прошивки</H2>
      <Muted>Соберите пакет из вашего файла. Приложение проверит поля, посчитает контрольную сумму и добавит пакет в библиотеку, после чего предложит его установку при подключении к подходящему блоку. Содержимое файла должно быть вашей собственной или лицензированной калибровкой.</Muted>

      <Card>
        <Body style={{ fontWeight: "700" }}>1. Что за пакет</Body>
        {row("Название", "title", "Например: Stage 1 для Golf 6 2.0 TDI")}
        {row("Версия", "version", "1.0.0")}
        {row("Описание", "description")}
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {CATEGORIES.map((c) => (
            <Pressable key={c.id} onPress={() => set("category", c.id)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: form.category === c.id ? colors.accent : colors.border, backgroundColor: form.category === c.id ? colors.cardAlt : "transparent" }}>
              <Text style={{ color: colors.text }}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        {form.category === "interface" ? (
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {THEMES.map((t) => (
              <Pressable key={t.id} onPress={() => set("themeId", t.id)} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: form.themeId === t.id ? colors.accent : colors.border }}>
                <Text style={{ color: colors.text, fontSize: 12 }}>{t.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>2. Для какого блока</Body>
        {liveScan ? (
          <>
            <Muted>Выберите блок подключённого автомобиля, поля заполнятся сами:</Muted>
            {liveScan.ecus.map((e) => (
              <Button key={e.txId} title={`${e.name} (${e.txId})`} kind="ghost" onPress={() => fromEcu(e.txId, e.ident.supplierSoftwareNumber ?? e.ident.softwareNumber ?? e.ident.softwareVersion ?? "")} />
            ))}
          </>
        ) : (
          <Muted>Подключитесь к автомобилю, чтобы выбрать блок, или впишите данные вручную.</Muted>
        )}
        {row("Номер(а) ПО блока (через запятую)", "targetSoftware", "1037525811")}
        {row("Адрес блока (txId)", "txId", "7E0")}
        {row("Номер ПО после прошивки (для проверки)", "expectedSoftware")}
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>3. Данные и процедура записи</Body>
        <Button title={fileName ? `Файл: ${fileName}` : "Выбрать файл с данными"} kind="ghost" onPress={() => void pickFile()} />
        {form.data ? <Muted>{form.data.length} байт · SHA-256 {sha256Hex(form.data).slice(0, 16)}…</Muted> : null}
        {row("Адрес записи в памяти блока (hex)", "address", "80000")}
        {row("Сессия программирования (hex)", "programmingSession", "02")}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Switch value={form.extendedSession} onValueChange={(v) => set("extendedSession", v)} />
          <Body style={{ flex: 1 }}>Сначала расширенная сессия (0x03)</Body>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Switch value={form.disableDtc} onValueChange={(v) => set("disableDtc", v)} />
          <Body style={{ flex: 1 }}>Отключить запись ошибок на время прошивки</Body>
        </View>
        {row("Уровень доступа SecurityAccess (нечётный hex, пусто — без ключа)", "securityLevel", "11")}
        <Muted>Алгоритм ключа:</Muted>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {Object.keys(SECURITY_ALGORITHMS).map((a) => (
            <Pressable key={a} onPress={() => set("algorithm", a)} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: form.algorithm === a ? colors.accent : colors.border }}>
              <Text style={{ color: colors.text, fontSize: 12 }}>{a}</Text>
            </Pressable>
          ))}
        </View>
        <Muted>Реальные алгоритмы для семейств блоков добавляются в приложение отдельно; сейчас доступен только демонстрационный.</Muted>
        {row("Процедура стирания (hex, пусто — нет)", "eraseRoutine", "FF00")}
        {row("Процедура проверки (hex, пусто — нет)", "checkRoutine", "0202")}
        {row("Тип сброса блока (hex)", "resetType", "01")}
      </Card>

      <Card>
        <Body style={{ fontWeight: "700" }}>4. Резервная копия оригинала</Body>
        <Muted>Область памяти, которую приложение прочитает перед записью, чтобы можно было откатиться.</Muted>
        {row("Адрес (hex)", "backupAddress", "80000")}
        {row("Длина (hex)", "backupLength", "2000")}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Switch value={form.roadLegal} onValueChange={(v) => set("roadLegal", v)} />
          <Body style={{ flex: 1 }}>Подходит для дорог общего пользования (без нарушения норм выбросов)</Body>
        </View>
      </Card>

      <Button title="Создать пакет" onPress={build} />
      {message ? (
        <Card tone={message.ok ? "good" : "bad"}>
          <Badge tone={message.ok ? "good" : "bad"} text={message.ok ? "Готово" : "Ошибка"} />
          <Body>{message.text}</Body>
        </Card>
      ) : null}
    </Screen>
  );
}
