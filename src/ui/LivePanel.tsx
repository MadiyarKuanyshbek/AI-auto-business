import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { PIDS, readPid, type LiveValue } from "../core/obd";
import { useSession } from "../session";
import { desktopBridge } from "../transport/desktop";
import { Body, Button, Card, Muted, colors } from "./kit";
import { Sparkline } from "./Sparkline";

const SHOWN = [0x0c, 0x0d, 0x05, 0x04, 0x0b, 0x11, 0x0f, 0x42, 0x10, 0x5c, 0x2f];

/**
 * Живые данные внутри карточки авто. Опрос идёт, только пока панель включена И экран открыт:
 * вкладки остаются в памяти, и иначе адаптер опрашивался бы в фоне и мешал сканированию и прошивке.
 */
export function LivePanel() {
  const { elm, scan, isIdle, exclusive } = useSession();
  const [on, setOn] = useState(false);
  const [values, setValues] = useState<Record<number, LiveValue>>({});
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(false);
  const [history, setHistory] = useState<Record<number, number[]>>({});
  const rows = useRef<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!on || !elm) return;
      alive.current = true;
      const supported = scan?.supportedPids.length ? new Set(scan.supportedPids) : null;
      const pids = SHOWN.filter((p) => !supported || supported.has(p));

      (async () => {
        while (alive.current) {
          for (const pid of pids) {
            if (!alive.current) return;
            // Пока адаптер занят прошивкой, кодированием или определением автомобиля, живые данные не опрашиваем.
            if (!isIdle()) {
              await new Promise((r) => setTimeout(r, 400));
              continue;
            }
            try {
              const v = await exclusive("Живые данные", () => readPid(elm, pid));
              setValues((prev) => ({ ...prev, [pid]: v }));
              setHistory((h) => ({ ...h, [pid]: [...(h[pid] ?? []).slice(-59), v.value] }));
              rows.current.push(`${new Date().toISOString()};${v.name};${String(v.value).replace(".", ",")};${v.unit}`);
              if (rows.current.length > 20000) rows.current.splice(0, rows.current.length - 20000);
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
    }, [on, elm, scan, isIdle, exclusive]),
  );

  if (!elm) return <Muted>Живые данные доступны при подключённом адаптере.</Muted>;

  return (
    <View style={{ gap: 10 }}>
      <Button title={on ? "Остановить живые данные" : "Показать живые данные"} kind={on ? "ghost" : "primary"} onPress={() => setOn((v) => !v)} />
      {on ? (
        <>
          <Muted>Значения обновляются раз в 1–2 секунды. Двигатель можно не заводить, но нужно зажигание.</Muted>
          {error ? <Body style={{ color: colors.warn }}>{error}</Body> : null}
          {desktopBridge() ? (
            <>
              <Button
                title="Сохранить записанные значения в CSV (Excel)"
                kind="ghost"
                onPress={() => {
                  void desktopBridge()!
                    .files.saveText(["Время;Параметр;Значение;Единица", ...rows.current].join("\n"), "Живые данные", "csv")
                    .then(setSaved);
                }}
              />
              {saved ? <Muted>Сохранено: {saved}</Muted> : null}
            </>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {SHOWN.map((pid) => {
              const def = PIDS.find((p) => p.pid === pid)!;
              const v = values[pid];
              return (
                <Card key={pid} style={{ width: "47.5%", alignItems: "flex-start" }}>
                  <Muted>{def.name}</Muted>
                  <Body style={{ fontSize: 24, fontWeight: "800" }}>{v ? (Number.isInteger(v.value) ? v.value : v.value.toFixed(1)) : "—"}</Body>
                  <Muted>{def.unit}</Muted>
                  <Sparkline values={history[pid] ?? []} width={110} />
                  {history[pid] && history[pid].length > 1 ? <Muted style={{ fontSize: 11 }}>мин {Math.min(...history[pid]).toFixed(0)} · макс {Math.max(...history[pid]).toFixed(0)}</Muted> : null}
                </Card>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}
