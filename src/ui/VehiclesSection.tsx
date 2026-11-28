import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { bytesHex } from "../core/coding";
import { resolveModelYear } from "../core/vin";
import { useStore } from "../storage/store";
import { desktopBridge, type FirmwareBackupMeta } from "../transport/desktop";
import { Badge, Body, Button, Card, Empty, H2, Muted, Row, colors } from "./kit";

const VIA: Record<string, string> = { ble: "Bluetooth LE", webbluetooth: "Bluetooth", wifi: "Wi‑Fi", serial: "USB / COM", demo: "Демо" };
const when = (t: number) => new Date(t).toLocaleString("ru-RU");

/** «Мои автомобили»: всё, что приложение запомнило о каждой машине при подключениях. */
export function VehiclesSection() {
  const store = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const bridge = desktopBridge();
  const router = useRouter();
  const { vehicles, installs, headUnits, coding } = store.data;
  const [backups, setBackups] = useState<Record<string, FirmwareBackupMeta[]>>({});
  const openVin = vehicles.find((v) => v.id === open)?.vin;

  // Когда раскрыта карточка автомобиля, подгружаем сохранённые копии оригинальной прошивки его блоков.
  useEffect(() => {
    if (!bridge || openVin === undefined) return;
    const t = setTimeout(() => void bridge.fwbackup.list(openVin).then((l) => setBackups((b) => ({ ...b, [openVin]: l }))), 100);
    return () => clearTimeout(t);
  }, [bridge, openVin]);

  async function exportProfile(id: string) {
    const v = vehicles.find((x) => x.id === id);
    if (!v || !bridge) return;
    const profile = {
      app: "autoflash-vehicle-profile",
      exportedAt: new Date().toISOString(),
      vehicle: v,
      installs: installs.filter((i) => i.vin === v.vin),
      coding: coding.filter((c) => c.vin === v.vin),
      headUnits: headUnits.filter((h) => h.vin === v.vin),
    };
    const file = await bridge.files.saveText(JSON.stringify(profile, null, 2), `Профиль ${v.vin || v.title}`, "json");
    setMessage(`Профиль сохранён: ${file}`);
  }

  if (vehicles.length === 0 && headUnits.length === 0) {
    return <Empty title="Пока нет сохранённых автомобилей" hint="При первом подключении к машине (любым способом) приложение само запомнит блоки, версии, настройки и способ связи." />;
  }

  return (
    <>
      <Muted>Приложение само запоминает при каждом подключении: блоки и их версии, ошибки, адаптер и способ связи, значения настроек блоков (кодирование) и данные магнитолы. Это нужно, чтобы дальше работать с машиной без повторного поиска и уметь вернуть прежние настройки.</Muted>
      {message ? <Badge tone="good" text={message} /> : null}
      {vehicles.map((v) => {
        const last = v.scans[v.scans.length - 1];
        const snaps = v.snapshots ?? [];
        const lastSnap = snaps[snaps.length - 1];
        const isOpen = open === v.id;
        const myInstalls = installs.filter((i) => i.vin === v.vin);
        const myHeads = headUnits.filter((h) => h.vin === v.vin);
        return (
          <Card key={v.id}>
            <Body style={{ fontWeight: "800", fontSize: 17 }}>{v.title}</Body>
            <Muted>VIN: {v.vin || "не определён"}</Muted>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <Badge text={`Подключений: ${snaps.length || v.scans.length}`} />
              {lastSnap ? <Badge tone="accent" text={`Последний раз: ${VIA[lastSnap.via] ?? lastSnap.via}`} /> : null}
              <Badge text={`Блоков: ${last?.ecus.length ?? 0}`} />
              {myInstalls.length ? <Badge tone="good" text={`Установок: ${myInstalls.length}`} /> : null}
              {myHeads.length ? <Badge tone="good" text="Магнитола записана" /> : null}
            </View>
            <Button title={isOpen ? "Скрыть подробности" : "Показать, что запомнено"} kind="ghost" onPress={() => setOpen(isOpen ? null : v.id)} />
            {isOpen ? (
              <>
                {last ? (
                  <>
                    <Row label="Год выпуска" value={resolveModelYear(last.vinInfo, last.vinOnline)} />
                    <Row label="Последнее сканирование" value={when(last.scannedAt)} />
                    <Row label="Ошибок при последнем скане" value={last.dtcs.length} />
                    <Body style={{ fontWeight: "700" }}>Блоки управления</Body>
                    {last.ecus.map((e) => (
                      <Muted key={e.txId}>• {e.name}: ПО {e.ident.supplierSoftwareNumber ?? e.ident.softwareNumber ?? e.ident.softwareVersion ?? "не считано"}</Muted>
                    ))}
                  </>
                ) : null}
                {lastSnap ? (
                  <>
                    <Body style={{ fontWeight: "700" }}>Подключение</Body>
                    <Row label="Через" value={`${VIA[lastSnap.via] ?? lastSnap.via}: ${lastSnap.label}`} />
                    <Row label="Адаптер" value={`${lastSnap.adapter.chip}, ${lastSnap.adapter.bus}`} />
                    <Row label="Напряжение" value={lastSnap.adapter.voltage !== null ? `${lastSnap.adapter.voltage.toFixed(1)} В` : null} />
                    {lastSnap.coding.length ? <Body style={{ fontWeight: "700" }}>Настройки блоков (кодирование)</Body> : null}
                    {lastSnap.coding.map((c) => (
                      <Row key={`${c.pkgId}-${c.txId}`} label={`${c.ecuName}: ${c.pkgTitle}`} value={bytesHex(c.value)} mono />
                    ))}
                  </>
                ) : null}
                {myHeads.map((h) => (
                  <View key={h.id} style={{ gap: 2 }}>
                    <Body style={{ fontWeight: "700" }}>Магнитола: {h.device}</Body>
                    <Muted>{when(h.at)} · {h.via === "usb" ? "по USB" : "по Wi‑Fi"} · Android {h.props["ro.build.version.release"] ?? "?"} · {h.props["ro.product.cpu.abi"] ?? "?"} · язык {h.props["persist.sys.locale"] || h.props["ro.product.locale"] || "?"}</Muted>
                    <Muted>Приложений установлено: {h.packages.length}</Muted>
                  </View>
                ))}
                {bridge && (backups[v.vin] ?? []).length > 0 ? (
                  <>
                    <Body style={{ fontWeight: "700" }}>Сохранённая оригинальная прошивка блоков ({backups[v.vin].length})</Body>
                    <Muted>Перед каждой записью приложение сохраняет оригинал блока отдельным файлом. Они не удаляются и не перезаписываются: любую можно вернуть.</Muted>
                    {backups[v.vin].map((b) => (
                      <View key={b.id} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <Body style={{ fontWeight: "600" }}>{b.ecuName}: ПО {b.software}</Body>
                        <Muted>{when(b.at)} · {(b.size / 1024).toFixed(1)} КБ · перед установкой «{b.pkgId}» v{b.pkgVersion}</Muted>
                        <Button title="Вернуть эту прошивку" kind="ghost" onPress={() => router.push({ pathname: "/cars/restore", params: { id: b.id, vin: b.vin } })} />
                      </View>
                    ))}
                    <Button title="Открыть папку с копиями" kind="ghost" onPress={() => void bridge.fwbackup.openFolder(v.vin)} />
                  </>
                ) : null}
                {myInstalls.length ? <Body style={{ fontWeight: "700" }}>История установок</Body> : null}
                {myInstalls.map((i) => (
                  <Muted key={`${i.packageId}-${i.at}`}>• {when(i.at)}: {i.packageId} v{i.version}</Muted>
                ))}
                {Platform.OS === "web" && bridge ? <Button title="Сохранить профиль автомобиля в файл" kind="ghost" onPress={() => void exportProfile(v.id)} /> : null}
                {confirmDelete === v.id ? (
                  <View style={{ gap: 6 }}>
                    <Muted>Автомобиль и всё запомненное о нём будет удалено из программы (на самой машине ничего не меняется).</Muted>
                    <Button title="Да, удалить из программы" kind="ghost" onPress={() => { store.removeVehicle(v.id); setConfirmDelete(null); setOpen(null); }} />
                    <Button title="Отмена" kind="ghost" onPress={() => setConfirmDelete(null)} />
                  </View>
                ) : (
                  <Button title="Удалить автомобиль из программы" kind="ghost" onPress={() => setConfirmDelete(v.id)} />
                )}
              </>
            ) : null}
          </Card>
        );
      })}
      {headUnits.some((h) => !h.vin) ? (
        <>
          <H2>Магнитолы без привязки к машине</H2>
          {headUnits.filter((h) => !h.vin).map((h) => (
            <Card key={h.id}>
              <Body style={{ fontWeight: "700" }}>{h.device}</Body>
              <Muted>{when(h.at)} · {h.via === "usb" ? "по USB" : "по Wi‑Fi"} · Android {h.props["ro.build.version.release"] ?? "?"} · приложений {h.packages.length}</Muted>
            </Card>
          ))}
        </>
      ) : null}
    </>
  );
}
