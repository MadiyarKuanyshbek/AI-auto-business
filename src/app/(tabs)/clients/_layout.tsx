import { Stack } from "expo-router";
import { colors } from "../../../ui/kit";

export default function ClientsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: "Назад",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Клиенты и заказы" }} />
      <Stack.Screen name="customer/[id]" options={{ title: "Клиент" }} />
      <Stack.Screen name="job/[id]" options={{ title: "Заказ" }} />
    </Stack>
  );
}
