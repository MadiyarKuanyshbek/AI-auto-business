import { Tabs } from "expo-router";
import { Text, useWindowDimensions } from "react-native";
import { colors } from "../../ui/kit";

const icon = (glyph: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;
  };

/** Пункты меню по порядку рабочего процесса мастера: подключился → увидел авто и данные → доработки → заказы. */
/** hasStack — у раздела свой вложенный стек (детали с кнопкой «Назад»), заголовок рисует он сам. */
const SCREENS = [
  { name: "index", title: "Подключение", step: 1, glyph: "🔌" },
  { name: "vehicle", title: "Авто", step: 2, glyph: "🚗" },
  { name: "tune", title: "Прошивки", step: 3, glyph: "⚙️", hasStack: true },
  { name: "clients", title: "Клиенты и заказы", step: 4, glyph: "👥", hasStack: true },
  { name: "settings", title: "Настройки", step: 5, glyph: "☰" },
] as const;

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  // На компьютере и планшете меню слева вертикально; на телефоне — снизу.
  const wide = width >= 820;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.bg },
        animation: "none",
        tabBarPosition: wide ? "left" : "bottom",
        tabBarVariant: wide ? "material" : undefined,
        tabBarLabelPosition: wide ? "beside-icon" : undefined,
        tabBarStyle: wide
          ? { backgroundColor: colors.card, borderRightColor: colors.border, borderRightWidth: 1, width: 285, minWidth: 285, maxWidth: 285 }
          : { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarItemStyle: wide ? { justifyContent: "flex-start", paddingHorizontal: 12, height: 46 } : undefined,
        tabBarLabelStyle: wide ? { fontSize: 15, fontWeight: "600", marginLeft: 6 } : undefined,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: wide ? colors.cardAlt : undefined,
      }}
    >
      {SCREENS.map((s) => (
        <Tabs.Screen
          key={s.name}
          name={s.name}
          options={{
            title: s.title,
            headerShown: !("hasStack" in s),
            tabBarLabel: wide ? `${s.step}. ${s.title}` : s.title,
            tabBarIcon: icon(s.glyph),
          }}
        />
      ))}
    </Tabs>
  );
}
