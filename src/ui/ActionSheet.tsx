import { Modal, Pressable, Text, View } from "react-native";
import { Button, Muted, colors } from "./kit";

export type SheetAction = { title: string; hint?: string; kind?: "primary" | "ghost"; onPress: () => void };

/** Небольшое окно с вариантами действий для найденного устройства или автомобиля. */
export function ActionSheet({ visible, title, subtitle, actions, onClose }: { visible: boolean; title: string; subtitle?: string; actions: SheetAction[]; onClose: () => void }) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable testID="sheet-backdrop" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, width: "100%", maxWidth: 440, gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{title}</Text>
          {subtitle ? <Muted>{subtitle}</Muted> : null}
          {actions.map((a) => (
            <View key={a.title} style={{ gap: 2 }}>
              <Button title={a.title} kind={a.kind ?? "primary"} onPress={a.onPress} />
              {a.hint ? <Muted style={{ fontSize: 12 }}>{a.hint}</Muted> : null}
            </View>
          ))}
          <Button title="Закрыть" kind="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
