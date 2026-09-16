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

  return (
    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Демо · {businessIcon} {businessLabel}
          </p>
          <h1 className="mt-1 font-display text-lg font-bold">{objectName}</h1>
        </div>
        <span
          className="motion-reduce:hidden h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-emerald-400"
          aria-hidden="true"
        />
      </div>

      <div className="min-h-[220px] space-y-3 p-5">
        {script.slice(0, shownTurns).map((turn, index) => (
          <div
            key={index}
            className={`animate-fade-up flex ${turn.role === "client" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                turn.role === "client"
                  ? "bg-accent text-accent-foreground"
                  : "bg-white/10 text-foreground"
              }`}
            >
              {turn.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className={`flex ${typing === "client" ? "justify-end" : "justify-start"}`}>
            <div
              className={`flex items-center gap-1 rounded-2xl px-4 py-3 ${
                typing === "client" ? "bg-accent/60" : "bg-white/10"
              }`}
            >
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-5">
        <p className="mb-3 text-xs font-medium text-muted">Что происходит «под капотом»:</p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
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

        {showOutcome && (
          <div className="animate-fade-up mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-center text-sm font-medium text-emerald-300">
            ✅ {config.outcome}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <button
          type="button"
          onClick={() => setPlayId((id) => id + 1)}
          disabled={!finished}
          className="w-full rounded-full border border-border bg-white/5 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          🔁 Смотреть ещё раз
        </button>
      </div>
    </div>
  );
}
