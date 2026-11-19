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
        </Stack>
      </SessionProvider>
    </StoreProvider>
  );
}
