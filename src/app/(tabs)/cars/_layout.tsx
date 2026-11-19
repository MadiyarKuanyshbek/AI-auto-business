import { Stack } from "expo-router";
import { colors } from "../../../ui/kit";

export default function CarsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: "Назад",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Авто и прошивки" }} />
      <Stack.Screen name="install" options={{ title: "Установка прошивки" }} />
    </Stack>
  );
}
