import { Stack, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { logEvent } from "../liveLog";
import { useStore } from "../storage/store";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../session";
import { StoreProvider } from "../storage/store";
import { DesktopChooser } from "../ui/DesktopChooser";
import { colors } from "../ui/kit";

/** Полоса сверху, если данные не удаётся сохранить: иначе пользователь потеряет их молча. */
function SaveBanner() {
  const { saveError } = useStore();
  if (!saveError) return null;
  return (
    <View style={{ backgroundColor: "#7F1D1D", padding: 10 }}>
      <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>{saveError}</Text>
    </View>
  );
}

export default function RootLayout() {
  // Необработанные ошибки не пропадают молча: они попадают в журнал событий на первой вкладке.
  useEffect(() => {
    if (typeof window === "undefined" || !window.addEventListener) return;
    const onRejection = (e: PromiseRejectionEvent) => logEvent(`Ошибка: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
  return (
    <StoreProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <SaveBanner />
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
