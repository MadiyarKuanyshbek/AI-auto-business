import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { PIDS, readPid, type LiveValue } from "../core/obd";
import { useSession } from "../session";
import { Body, Card, Empty, Muted, Screen, colors } from "../ui/kit";

const SHOWN = [0x0c, 0x0d, 0x05, 0x04, 0x0b, 0x11, 0x0f, 0x42, 0x10, 0x5c, 0x2f];

export default function LiveScreen() {
  const { elm, scan } = useSession();
  const [values, setValues] = useState<Record<number, LiveValue>>({});
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const supported = scan?.supportedPids.length ? new Set(scan.supportedPids) : null;
    const pids = SHOWN.filter((p) => !supported || supported.has(p));

    (async () => {
      if (!elm) return;
      while (alive.current) {
        for (const pid of pids) {
          if (!alive.current) return;
          try {
            const v = await readPid(elm, pid);
            setValues((prev) => ({ ...prev, [pid]: v }));
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Ошибка чтения");
          }
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [elm, scan]);

  if (!elm) return <Screen><Empty title="Нет подключения" hint="Подключитесь к адаптеру на вкладке «Подключение»." /></Screen>;

  return (
    <Screen>
      <Muted>Опрос идёт по очереди, поэтому значения обновляются раз в 1–2 секунды. Двигатель можно не заводить, но нужно зажигание.</Muted>
      {error ? <Body style={{ color: colors.warn }}>{error}</Body> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {SHOWN.map((pid) => {
          const def = PIDS.find((p) => p.pid === pid)!;
          const v = values[pid];
          return (
            <Card key={pid} style={{ width: "47.5%", alignItems: "flex-start" }}>
              <Muted>{def.name}</Muted>
              <Body style={{ fontSize: 24, fontWeight: "800" }}>{v ? (Number.isInteger(v.value) ? v.value : v.value.toFixed(1)) : "—"}</Body>
              <Muted>{def.unit}</Muted>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
