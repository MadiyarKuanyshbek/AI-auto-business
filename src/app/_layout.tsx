import { Stack, type ErrorBoundaryProps } from "expo-router";
import { Pressable, Text, View } from "react-native";
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

/** Если экран упал с ошибкой, показываем понятное сообщение и кнопку повтора вместо белого окна. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>Что-то пошло не так</Text>
      <Text style={{ color: colors.muted, textAlign: "center" }}>Данные сохранены. Нажмите «Повторить»; если ошибка остаётся, перезапустите приложение.</Text>
      <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>{error.message}</Text>
      <Pressable onPress={retry} style={{ backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}>
        <Text style={{ color: "#fff", fontWeight: "800" }}>Повторить</Text>
      </Pressable>
    </View>
  );
}
