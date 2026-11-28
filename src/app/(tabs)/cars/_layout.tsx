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
      <Stack.Screen name="restore" options={{ title: "Вернуть прежнюю прошивку" }} />
      <Stack.Screen name="coding" options={{ title: "Кодирование блока" }} />
      <Stack.Screen name="task" options={{ title: "Как это сделать" }} />
      <Stack.Screen name="apps" options={{ title: "Приложения и русификация" }} />
      <Stack.Screen name="builder" options={{ title: "Конструктор пакета" }} />
    </Stack>
  );
}
