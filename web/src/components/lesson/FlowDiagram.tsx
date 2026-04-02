"use client";

import { motion } from "framer-motion";

export interface FlowStep {
  label: string;
  detail?: string;
  type?: "start" | "end" | "decision" | "process";
}

export default function FlowDiagram({
  steps,
  accentColor,
  direction = "vertical",
}: {
  steps: FlowStep[];
  accentColor: string;
  direction?: "vertical" | "horizontal";
}) {
  const isH = direction === "horizontal";

  return (
    <div className={`my-4 flex ${isH ? "flex-row items-center gap-0 overflow-x-auto pb-2" : "flex-col items-center gap-0"}`}>
      {steps.map((step, i) => {
        const isDecision = step.type === "decision";
        const isTerminal = step.type === "start" || step.type === "end";

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, [isH ? "x" : "y"]: 8 }}
            animate={{ opacity: 1, [isH ? "x" : "y"]: 0 }}
            transition={{ delay: i * 0.06, duration: 0.25 }}
            className={`flex ${isH ? "flex-row" : "flex-col"} items-center`}
          >
            {/* Node */}
            <div
              className="relative text-center px-3 py-2 text-[11px] font-medium shrink-0"
              style={{
                background: isTerminal ? `${accentColor}15` : isDecision ? "var(--color-amber-glow)" : "var(--color-bg-surface)",
                color: isTerminal ? accentColor : isDecision ? "var(--color-amber)" : "var(--color-text)",
                border: `1px solid ${isTerminal ? `${accentColor}33` : isDecision ? "var(--color-amber-dim)" : "var(--color-border-subtle)"}`,
                borderRadius: isTerminal ? "999px" : isDecision ? "4px" : "6px",
                minWidth: isH ? "auto" : "160px",
                maxWidth: isH ? "140px" : "220px",
                transform: isDecision ? "rotate(0deg)" : "none",
              }}
            >
              {step.label}
              {step.detail && (
                <div className="text-[9px] mt-0.5" style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>
                  {step.detail}
                </div>
              )}
            </div>

            {/* Arrow */}
            {i < steps.length - 1 && (
              <div className={`flex ${isH ? "flex-row" : "flex-col"} items-center`}
                style={{ color: "var(--color-text-tertiary)" }}>
                {isH ? (
                  <span className="text-[10px] px-1">→</span>
                ) : (
                  <span className="text-[10px] py-0.5">↓</span>
                )}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
