import { useState } from "react";
import { desktopBridge } from "../transport/desktop";
import { Badge, Body, Button, Card, H2, Muted } from "./kit";

type Check = Awaited<ReturnType<NonNullable<ReturnType<typeof desktopBridge>>["update"]["check"]>>;

/** Версия приложения и проверка обновлений. Обращается к GitHub только по нажатию кнопки. */
export function AboutCard() {
  const bridge = desktopBridge();
  const [result, setResult] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  if (!bridge) return null;

  async function check() {
    setBusy(true);
    setResult(await bridge!.update.check());
    setBusy(false);
  }

  return (
    <>
      <H2>О приложении и обновления</H2>
      <Card>
        <Muted>Проверка обращается к странице релизов на GitHub (открытый адрес). Приложение ничего не скачивает само: только сообщает, что вышла новая версия.</Muted>
        <Button title={busy ? "Проверяю…" : "Проверить обновления"} kind="ghost" disabled={busy} onPress={() => void check()} />
        {result ? (
          result.ok ? (
            result.latest === null || result.latest === undefined ? (
              <Badge text={`Версия ${result.current}. Опубликованных релизов пока нет.`} />
            ) : result.newer ? (
              <>
                <Badge tone="warn" text={`Доступна версия ${result.latest} (у вас ${result.current})`} />
                {result.notes ? <Muted>{result.notes}</Muted> : null}
                <Button title="Открыть страницу загрузки" onPress={() => void bridge!.update.open(result.downloadUrl ?? result.url ?? "")} />
              </>
            ) : (
              <Badge tone="good" text={`У вас последняя версия ${result.current}`} />
            )
          ) : (
            <Body>{result.error}</Body>
          )
        ) : null}
      </Card>
    </>
  );
}
