import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { colors } from "./kit";

export type BlipKind = "car" | "obd" | "adb" | "ble";
export type Blip = { id: string; kind: BlipKind; label: string; sub?: string; connected?: boolean };

const ICON: Record<BlipKind, string> = { car: "🚗", obd: "📡", adb: "📺", ble: "🔵" };

/** Радар: вращающаяся развёртка, найденные устройства появляются точками, нажатие открывает действия. */
export function Radar({ blips, scanning, onPick, paused = false, size = 480 }: { blips: Blip[]; scanning: boolean; onPick: (b: Blip) => void; paused?: boolean; size?: number }) {
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (paused) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: scanning ? 2200 : 6000, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [spin, scanning, paused]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const c = size / 2;

  return (
    <View testID="radar" style={{ width: size, height: size, alignSelf: "center", maxWidth: "100%" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute" }}>
        <Circle cx={c} cy={c} r={c - 2} fill="#0A1626" stroke="#1F3B5C" strokeWidth={2} />
        {[0.75, 0.5, 0.25].map((k) => (
          <Circle key={k} cx={c} cy={c} r={(c - 2) * k} fill="none" stroke="#1F3B5C" strokeWidth={1} />
        ))}
        <Line x1={c} y1={4} x2={c} y2={size - 4} stroke="#1F3B5C" strokeWidth={1} />
        <Line x1={4} y1={c} x2={size - 4} y2={c} stroke="#1F3B5C" strokeWidth={1} />
      </Svg>

      <Animated.View style={{ position: "absolute", width: size, height: size, transform: [{ rotate }] }} pointerEvents="none">
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Path d={`M ${c} ${c} L ${c} 6 A ${c - 6} ${c - 6} 0 0 1 ${c + (c - 6) * Math.sin(0.9)} ${c - (c - 6) * Math.cos(0.9)} Z`} fill="#3DDC97" fillOpacity={scanning ? 0.28 : 0.12} />
          <Line x1={c} y1={c} x2={c} y2={6} stroke="#3DDC97" strokeWidth={2} strokeOpacity={0.9} />
        </Svg>
      </Animated.View>

      <View style={{ position: "absolute", left: c - 22, top: c - 22, width: 44, height: 44, borderRadius: 22, backgroundColor: "#12304F", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2B5C8F" }}>
        <Text style={{ fontSize: 22 }}>💻</Text>
      </View>

      {blips.map((b, idx) => {
        // Равномерно раскладываем точки по золотому углу, чтобы подписи не налезали друг на друга.
        const angle = -Math.PI / 2 + 0.7 + idx * 2.399963;
        const ring = [0.88, 0.58, 0.74, 0.5][idx % 4];
        const r = (c - 48) * ring;
        const x = c + Math.cos(angle) * r;
        const y = c + Math.sin(angle) * r;
        return (
          <Pressable
            key={b.id}
            testID={`blip-${b.kind}`}
            onPress={() => onPick(b)}
            accessibilityLabel={b.label}
            style={{ position: "absolute", left: x - 42, top: y - 24, width: 84, alignItems: "center" }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: b.connected ? "#14532D" : "#10223A",
                borderWidth: 2,
                borderColor: b.connected ? "#3DDC97" : colors.accent,
              }}
            >
              <Text style={{ fontSize: 20 }}>{ICON[b.kind]}</Text>
            </View>
            <Text numberOfLines={2} style={{ color: colors.text, fontSize: 11, fontWeight: "600", textAlign: "center", marginTop: 2 }}>
              {b.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
