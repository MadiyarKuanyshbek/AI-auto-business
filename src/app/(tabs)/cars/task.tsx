import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CHINESE_MAKES, DIFFERENCE, TASKS, planFor, type TaskKind } from "../../../core/guides";
import { useSession } from "../../../session";
import { vehicleTitle } from "../../../storage/model";
import { Badge, Body, Button, Card, H2, Muted, Screen, colors } from "../../../ui/kit";

const RISK_TONE = { low: "good", medium: "warn", high: "bad" } as const;
const RISK_TEXT = { low: "Риск: низкий", medium: "Риск: средний", high: "Риск: высокий" } as const;

/** Пошаговое объяснение одной задачи (прошивка, русификация, приложения) для выбранной марки. */
export default function TaskScreen() {
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { liveScan, connection } = useSession();
  const carTitle = liveScan ? vehicleTitle(liveScan) : null;
  const isConnected = connection.status === "ready";
  const k: TaskKind = kind === "russify" || kind === "apps" ? kind : "firmware";
  const guide = TASKS[k];

  const connectedMake = liveScan?.vinOnline?.make ?? liveScan?.vinInfo?.make ?? null;
  const normalized = connectedMake ? CHINESE_MAKES.find((m) => m.toLowerCase() === connectedMake.toLowerCase()) : undefined;
  const [make, setMake] = useState<string>(normalized ?? "Chery");
  const plan = planFor(k, make);

  const action =
    k === "firmware"
      ? { title: "Открыть блоки и пакеты прошивки", go: () => router.push("/cars") }
      : k === "russify"
        ? { title: "Открыть выбор языка на магнитоле (Wi‑Fi)", go: () => router.push("/cars/apps") }
        : { title: "Установить приложения (Wi‑Fi)", go: () => router.push("/cars/apps") };

  return (
    <Screen>
      <H2>{`${guide.icon} ${guide.title}`}</H2>
      {isConnected ? (
        <Card tone="good">
          <Body style={{ fontWeight: "800" }}>✅ Подключено: {carTitle ?? connection.label}</Body>
          <Muted>Автомобиль подключён {connection.kind === "demo" ? "(демо)" : ""}. Ниже шаги для этой машины.</Muted>
        </Card>
      ) : (
        <Card tone="warn">
          <Body style={{ fontWeight: "800" }}>Автомобиль не подключён</Body>
          <Muted>Сначала подключитесь на вкладке «Подключение»: после подключения здесь появится название машины.</Muted>
          <Button title="Подключиться к автомобилю" onPress={() => router.push("/")} />
        </Card>
      )}
      <Card>
        <Body style={{ fontWeight: "700" }}>Что это такое</Body>
        {guide.what.map((t) => (
          <Muted key={t}>{t}</Muted>
        ))}
        <Body style={{ fontWeight: "700" }}>Что изменится</Body>
        {guide.changes.map((t) => (
          <Muted key={t}>• {t}</Muted>
        ))}
        <Body style={{ fontWeight: "700" }}>Что нужно</Body>
        {guide.need.map((t) => (
          <Muted key={t}>• {t}</Muted>
        ))}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Badge tone={RISK_TONE[guide.risk.level]} text={RISK_TEXT[guide.risk.level]} />
          <Badge text={`Через: ${guide.via}`} />
        </View>
        <Muted>{guide.risk.text}</Muted>
      </Card>

      <H2>Ваша марка</H2>
      <Card>
        {connectedMake ? <Muted>Подключён автомобиль: {connectedMake}. Можно выбрать другую марку.</Muted> : <Muted>Выберите марку, чтобы увидеть шаги именно для неё.</Muted>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {CHINESE_MAKES.map((m) => (
            <Pressable key={m} onPress={() => setMake(m)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: make === m ? colors.accent : colors.card, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <H2>{`Как это сделать: ${make}`}</H2>
      <Card>
        {plan.steps.map((t, i) => (
          <View key={t} style={{ flexDirection: "row", gap: 10 }}>
            <Text style={{ color: colors.accent, fontWeight: "800", width: 20 }}>{i + 1}.</Text>
            <Body style={{ flex: 1 }}>{t}</Body>
          </View>
        ))}
        {plan.notes.map((t) => (
          <Muted key={t}>• {t}</Muted>
        ))}
        <Muted>Сведения о марках собраны из обсуждений владельцев и заметок производителей. На вашей версии системы пункты меню могут называться иначе.</Muted>
        <Button title={action.title} onPress={action.go} />
      </Card>

      <H2>Чем это отличается</H2>
      <Card>
        {DIFFERENCE.map((d) => (
          <View key={d.title} style={{ gap: 2 }}>
            <Body style={{ fontWeight: "700" }}>{d.title}</Body>
            <Muted>{d.text}</Muted>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
