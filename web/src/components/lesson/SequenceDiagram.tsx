"use client";

import { motion } from "framer-motion";

export interface SeqStep {
  from: string;
  to: string;
  label: string;
  note?: string;
  dashed?: boolean;
}

const ACTORS: Record<string, { label: string; color: string }> = {
  user: { label: "用户", color: "var(--color-green)" },
  loop: { label: "Agent Loop", color: "var(--color-amber)" },
  api: { label: "API", color: "var(--color-blue)" },
  tools: { label: "工具", color: "var(--color-purple)" },
  model: { label: "模型", color: "var(--color-blue)" },
  compact: { label: "压缩", color: "oklch(0.65 0.12 30)" },
  registry: { label: "Registry", color: "var(--color-purple)" },
  permission: { label: "权限", color: "oklch(0.7 0.14 50)" },
};

export default function SequenceDiagram({
  actors,
  steps,
  accentColor,
}: {
  actors: string[];
  steps: SeqStep[];
  accentColor: string;
}) {
  const actorWidth = 100 / actors.length;
  const getX = (id: string) => {
    const idx = actors.indexOf(id);
    return idx >= 0 ? actorWidth * idx + actorWidth / 2 : 50;
  };

  return (
    <div className="my-4 rounded-lg overflow-hidden" style={{ background: "oklch(0.11 0.008 65)", border: "1px solid var(--color-border-subtle)" }}>
      {/* Actor headers */}
      <div className="flex border-b" style={{ borderColor: "var(--color-border-subtle)" }}>
        {actors.map((id) => {
          const actor = ACTORS[id] || { label: id, color: "var(--color-text-tertiary)" };
          return (
            <div key={id} className="flex-1 text-center py-2.5">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: `${actor.color}15`, color: actor.color }}>
                {actor.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Steps */}
      <div className="relative px-3 py-2">
        {/* Lifelines */}
        <div className="absolute inset-0 flex pointer-events-none" style={{ top: 0, bottom: 0 }}>
          {actors.map((id) => (
            <div key={id} className="flex-1 flex justify-center">
              <div className="w-px h-full" style={{ background: "var(--color-border-subtle)" }} />
            </div>
          ))}
        </div>

        {/* Messages */}
        {steps.map((step, i) => {
          const fromX = getX(step.from);
          const toX = getX(step.to);
          const isLeft = fromX < toX;
          const isSelf = step.from === step.to;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
              className="relative py-1.5"
              style={{ minHeight: step.note ? 42 : 28 }}
            >
              {/* Arrow line */}
              <div className="absolute flex items-center" style={{
                left: `${Math.min(fromX, toX)}%`,
                right: `${100 - Math.max(fromX, toX)}%`,
                top: "50%",
                transform: "translateY(-50%)",
              }}>
                <div className="w-full flex items-center relative">
                  {/* Line */}
                  <div className="absolute inset-x-0 h-px" style={{
                    background: step.dashed ? "none" : `${accentColor}55`,
                    borderTop: step.dashed ? `1px dashed ${accentColor}44` : "none",
                  }} />
                  {/* Arrowhead */}
                  <div className="absolute text-[8px]" style={{
                    [isLeft ? "right" : "left"]: "-1px",
                    color: `${accentColor}88`,
                  }}>
                    {isLeft ? "▶" : "◀"}
                  </div>
                </div>
              </div>

              {/* Label */}
              <div className="relative z-10 text-center">
                <span className="text-[10px] px-2 py-0.5 rounded"
                  style={{ background: "oklch(0.13 0.01 65)", color: "var(--color-text-secondary)" }}>
                  {step.label}
                </span>
                {step.note && (
                  <div className="text-[9px] mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                    {step.note}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
