import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { desktopBridge, type ChooserDevice, type ChooserKind } from "../transport/desktop";
import { Button, Muted, colors } from "./kit";

/** Окно выбора устройства (Bluetooth / COM-порт) в настольном приложении. */
export function DesktopChooser() {
  const [state, setState] = useState<{ kind: ChooserKind; devices: ChooserDevice[] } | null>(null);

  useEffect(() => desktopBridge()?.chooser.onList(setState), []);

  if (!state) return null;
  const title = state.kind === "bluetooth" ? "Выберите Bluetooth-устройство" : "Выберите COM-порт";

  function pick(id: string | null) {
    desktopBridge()?.chooser.pick(state!.kind, id);
    setState(null);
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={() => pick(null)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, width: "100%", maxWidth: 460, gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{title}</Text>
          <Muted>
            {state.devices.length === 0
              ? state.kind === "bluetooth"
                ? "Поиск устройств… Включите адаптер и Bluetooth на компьютере."
                : "Порты не найдены. Подключите адаптер или спарьте его в настройках Windows."
              : "Выберите адаптер из списка."}
          </Muted>
          {state.devices.map((d) => (
            <Pressable key={d.id} onPress={() => pick(d.id)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{d.name}</Text>
            </Pressable>
          ))}
          <Button title="Отмена" kind="ghost" onPress={() => pick(null)} />
        </View>
      </View>
    </Modal>
  );
}
