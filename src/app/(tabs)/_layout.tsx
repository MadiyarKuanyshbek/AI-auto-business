import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../ui/kit";

const icon = (glyph: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Подключение", tabBarIcon: icon("🔌") }} />
      <Tabs.Screen name="vehicle" options={{ title: "Авто", tabBarIcon: icon("🚗") }} />
      <Tabs.Screen name="tune" options={{ title: "Прошивки", tabBarIcon: icon("⚙️") }} />
      <Tabs.Screen name="clients" options={{ title: "Клиенты", tabBarIcon: icon("👥") }} />
      <Tabs.Screen name="settings" options={{ title: "Ещё", tabBarIcon: icon("☰") }} />
    </Tabs>
  );
}
