import { Stack } from "expo-router";
import { colors } from "../../../ui/kit";

export default function TuneLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: "Назад",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Прошивки" }} />
      <Stack.Screen name="flash" options={{ title: "Прошивка блока" }} />
    </Stack>
  );
}
