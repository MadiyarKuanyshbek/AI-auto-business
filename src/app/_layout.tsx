import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../session";
import { StoreProvider } from "../storage/store";
import { DesktopChooser } from "../ui/DesktopChooser";
import { colors } from "../ui/kit";

export default function RootLayout() {
  return (
    <StoreProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <DesktopChooser />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="live" options={{ title: "Данные в реальном времени" }} />
          <Stack.Screen name="flash" options={{ title: "Прошивка блока" }} />
          <Stack.Screen name="job/[id]" options={{ title: "Заказ" }} />
          <Stack.Screen name="customer/[id]" options={{ title: "Клиент" }} />
        </Stack>
      </SessionProvider>
    </StoreProvider>
  );
}
