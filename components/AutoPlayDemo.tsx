"use client";

import { useEffect, useRef, useState } from "react";
import type { FlowStep, ResolvedDemoConfig } from "@/lib/products";

type ScriptTurn = { role: "bot" | "client"; text: string };

const TYPING_BOT_MS = 900;
const TYPING_CLIENT_MS = 500;
const PAUSE_AFTER_TURN_MS = 900;
const FLOW_STEP_MS = 550;
const OUTCOME_DELAY_MS = 400;

function buildScript(config: ResolvedDemoConfig): ScriptTurn[] {
  const turns: ScriptTurn[] = [{ role: "bot", text: config.greeting }];
  for (const rule of config.rules.slice(0, 3)) {
    turns.push({ role: "client", text: rule.sampleQuestion });
    turns.push({ role: "bot", text: rule.answer });
  }
  return turns;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function timeForIndex(index: number) {
  const totalMinutes = 41 + index;
  const hours = 9 + Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function AutoPlayDemo({
  objectName,
  businessLabel,
  businessIcon,
  flow,
  config,
}: {
  objectName: string;
  businessLabel: string;
  businessIcon: string;
  flow: FlowStep[];
  config: ResolvedDemoConfig;
}) {
  const script = buildScript(config);
  const [playId, setPlayId] = useState(0);
  const [shownTurns, setShownTurns] = useState(0);
  const [typing, setTyping] = useState<"bot" | "client" | null>(null);
  const [flowRevealed, setFlowRevealed] = useState(0);
  const [showOutcome, setShowOutcome] = useState(false);
  const [finished, setFinished] = useState(false);
  const cancelledRef = useRef(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cancelledRef.current = false;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    async function run() {
      setShownTurns(0);
      setTyping(null);
      setFlowRevealed(0);
      setShowOutcome(false);
      setFinished(false);

      if (reduceMotion) {
        setShownTurns(script.length);
        setFlowRevealed(flow.length);
        setShowOutcome(true);
        setFinished(true);
        return;
      }

      for (let i = 0; i < script.length; i++) {
        if (cancelledRef.current) return;
        const turn = script[i];
        setTyping(turn.role);
        await sleep(turn.role === "bot" ? TYPING_BOT_MS : TYPING_CLIENT_MS);
        if (cancelledRef.current) return;
        setTyping(null);
        setShownTurns(i + 1);
        await sleep(PAUSE_AFTER_TURN_MS);
      }

      for (let i = 0; i < flow.length; i++) {
        if (cancelledRef.current) return;
        setFlowRevealed(i + 1);
        await sleep(FLOW_STEP_MS);
      }

      if (cancelledRef.current) return;
      await sleep(OUTCOME_DELAY_MS);
      setShowOutcome(true);
      setFinished(true);
    }

    run();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playId]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [shownTurns, typing]);

  function skip() {
    cancelledRef.current = true;
    setTyping(null);
    setShownTurns(script.length);
    setFlowRevealed(flow.length);
    setShowOutcome(true);
    setFinished(true);
  }

  const stageCaption =
    flowRevealed > 0 && flowRevealed <= flow.length
      ? `Сейчас: ${flow[flowRevealed - 1].title}`
      : shownTurns < script.length
        ? "Сейчас: идёт переписка в WhatsApp"
        : "";

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="flex w-full flex-col items-center gap-2">
        <p className="text-xs font-medium text-muted">
          📱 Так клиент видит это в своём WhatsApp
        </p>

        <div className="w-full overflow-hidden rounded-[2rem] border-4 border-black bg-black shadow-2xl">
          <div className="flex items-center justify-between px-5 pb-1 pt-2 text-[10px] font-medium text-white">
            <span>{timeForIndex(0)}</span>
            <span className="flex items-center gap-1">📶 🔋</span>
          </div>

          <div className="flex items-center gap-3 bg-[#075e54] px-3 py-2.5 text-white">
            <span aria-hidden="true">←</span>
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-lg">
              {businessIcon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{businessLabel}</p>
              <p className="text-[11px] text-white/70">
                {typing === "bot" ? "печатает..." : "online"}
              </p>
            </div>
            <span aria-hidden="true" className="text-sm">📹</span>
            <span aria-hidden="true" className="text-sm">📞</span>
          </div>

          <div
            ref={chatRef}
            className="max-h-[380px] min-h-[280px] space-y-2 overflow-y-auto bg-[#0b141a] p-3"
          >
            {script.slice(0, shownTurns).map((turn, index) => (
              <div
                key={index}
                className={`animate-fade-up flex ${turn.role === "client" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] rounded-lg px-2.5 py-1.5 text-[13px] leading-snug shadow ${
                    turn.role === "client"
                      ? "rounded-tr-sm bg-[#005c4b] text-white"
                      : "rounded-tl-sm bg-[#1f2c34] text-white"
                  }`}
                >
                  <p>{turn.text}</p>
                  <p
                    className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                      turn.role === "client" ? "text-white/60" : "text-white/40"
                    }`}
                  >
                    {timeForIndex(index)}
                    {turn.role === "client" && <span className="text-[#53bdeb]">✓✓</span>}
                  </p>
                </div>
              </div>
            ))}
            {typing && (
              <div className={`flex ${typing === "client" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`flex items-center gap-1 rounded-lg px-3 py-2.5 ${
                    typing === "client" ? "rounded-tr-sm bg-[#005c4b]" : "rounded-tl-sm bg-[#1f2c34]"
                  }`}
                >
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70" />
                </div>
              </div>
            )}
          </div>
        </div>

        {!finished && (
          <button
            type="button"
            onClick={skip}
            className="mt-1 text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            ⏭ Пропустить и сразу увидеть результат
          </button>
        )}
      </div>

      <div className="w-full rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          ⚙️ А вот что в этот момент происходит у вас за кулисами
        </p>
        <h2 className="mt-1 font-display text-base font-bold">{objectName}</h2>

        <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
          {flow.map((step, index) => (
            <div key={step.title} className="flex items-center gap-1">
              <div
                className={`flex w-24 flex-shrink-0 flex-col items-center gap-1 rounded-xl p-2 text-center transition-all duration-500 ${
                  index < flowRevealed ? "scale-100 opacity-100" : "scale-90 opacity-30"
                }`}
              >
                <span className="text-xl">{index < flowRevealed ? "✅" : step.icon}</span>
                <span className="text-[10px] leading-tight text-muted">{step.title}</span>
              </div>
              {index < flow.length - 1 && (
                <span className="flex-shrink-0 text-muted">→</span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-3 h-4 text-xs font-medium text-accent">{stageCaption}</p>

        {showOutcome && (
          <div className="animate-fade-up mt-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-center text-sm font-medium text-emerald-300">
            ✅ {config.outcome}
          </div>
        )}

        <button
          type="button"
          onClick={() => setPlayId((id) => id + 1)}
          disabled={!finished}
          className="mt-4 w-full rounded-full border border-border bg-white/5 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          🔁 Смотреть ещё раз
        </button>
      </div>
    </div>
  );
}
