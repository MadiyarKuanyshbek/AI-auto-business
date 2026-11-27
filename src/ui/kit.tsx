import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";

export const colors = {
  bg: "#0B1220",
  card: "#131C2E",
  cardAlt: "#1A2540",
  border: "#25324F",
  text: "#E8EEF9",
  muted: "#8FA0BF",
  accent: "#3B82F6",
  good: "#22C55E",
  warn: "#F59E0B",
  bad: "#EF4444",
};

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const body = <View style={[padded && { padding: 16, gap: 12 }]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>{body}</ScrollView> : body}
    </View>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: "warn" | "bad" | "good" }) {
  const border = tone ? colors[tone] : colors.border;
  return <View style={[s.card, { borderColor: border }, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.body, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
}) {
  const bg = kind === "primary" ? colors.accent : kind === "danger" ? colors.bad : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: kind === "ghost" ? colors.border : bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{title}</Text>}
    </Pressable>
  );
}

export function Badge({ text, tone = "muted" }: { text: string; tone?: "good" | "warn" | "bad" | "accent" | "muted" }) {
  const c = tone === "muted" ? colors.muted : colors[tone];
  return (
    <View style={[s.badge, { borderColor: c, flexShrink: 1, maxWidth: "100%" }]}>
      <Text style={{ color: c, fontSize: 12, fontWeight: "600", flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

export function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <View style={s.row}>
      <Text style={[s.muted, { flex: 1 }]}>{label}</Text>
      <Text style={[s.body, { flex: 1.4, textAlign: "right" }, mono && { fontFamily: "monospace" }]} selectable>
        {String(value)}
      </Text>
    </View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.muted}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...rest} style={[s.input, rest.multiline && { minHeight: 80, textAlignVertical: "top" }, rest.style]} />
    </View>
  );
}

export function Progress({ fraction, label }: { fraction: number; label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.muted}>{label}</Text> : null}
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.max(2, Math.min(100, fraction * 100))}%` }]} />
      </View>
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ alignItems: "center", padding: 32, gap: 6 }}>
      <Text style={[s.h2, { textAlign: "center" }]}>{title}</Text>
      {hint ? <Text style={[s.muted, { textAlign: "center" }]}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  h1: { color: colors.text, fontSize: 24, fontWeight: "800" },
  h2: { color: colors.text, fontSize: 17, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 13 },
  body: { color: colors.text, fontSize: 14 },
  button: { borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", minHeight: 46 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  badge: { borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 9, alignSelf: "flex-start" },
  row: { flexDirection: "row", gap: 12, paddingVertical: 3 },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: "hidden" },
  fill: { height: 8, backgroundColor: colors.accent, borderRadius: 4 },
});
