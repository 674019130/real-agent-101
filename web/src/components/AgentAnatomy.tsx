"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface OrganDef {
  id: string;
  label: string;
  labelZh: string;
  lesson: string;
  x: number;
  y: number;
  char: string;
  size?: number;
}

const organs: OrganDef[] = [
  // L01: Agent loop, streaming, messages
  { id: "brain",    label: "LLM / Brain",       labelZh: "大脑·LLM",      lesson: "l01", x: 100, y: 22,  char: "◈", size: 20 },
  { id: "eyes",     label: "Input / Eyes",       labelZh: "眼·输入",       lesson: "l01", x: 60,  y: 52,  char: "◉" },
  { id: "mouth",    label: "Output / Mouth",     labelZh: "嘴·输出",       lesson: "l01", x: 140, y: 52,  char: "◎" },
  // L06: Context compression (was L01 memory, now also L06)
  { id: "memory",   label: "Context / Memory",   labelZh: "记忆·压缩",     lesson: "l06", x: 100, y: 72,  char: "⬡", size: 16 },
  // L03: Tool registry + L09: Skill system
  { id: "heart",    label: "Registry / Heart",   labelZh: "心·注册表",     lesson: "l03", x: 100, y: 100, char: "♦", size: 14 },
  { id: "hands",    label: "Tools / Hands",      labelZh: "手·工具",       lesson: "l03", x: 48,  y: 100, char: "⚙" },
  { id: "hands2",   label: "Tools / Hands",      labelZh: "手·工具",       lesson: "l03", x: 152, y: 100, char: "⚙" },
  // L04: Agent loop / L07: Concurrent executor
  { id: "skeleton", label: "Loop / Skeleton",    labelZh: "骨架·执行器",    lesson: "l07", x: 100, y: 130, char: "∞", size: 16 },
  // L02: Environment / L08: Environment + hooks + sub-agent
  { id: "legs",     label: "Environment / Legs", labelZh: "腿·环境",       lesson: "l08", x: 72,  y: 158, char: "▽" },
  { id: "legs2",    label: "Environment / Legs", labelZh: "腿·环境",       lesson: "l08", x: 128, y: 158, char: "▽" },
  // L05: Permission system
  { id: "shield",   label: "Permissions",        labelZh: "盾·权限",       lesson: "l05", x: 100, y: 46,  char: "⛊", size: 12 },
  // L09: Skill & Command (progressive disclosure)
  { id: "skill",    label: "Skills / Knowledge", labelZh: "技·披露",       lesson: "l09", x: 28,  y: 130, char: "◇", size: 12 },
  // L10: System Prompt integration
  { id: "prompt",   label: "System Prompt",      labelZh: "魂·提示词",     lesson: "l10", x: 172, y: 130, char: "✧", size: 12 },
];

const connections: [number, number, number, number][] = [
  [100, 36, 100, 60],   // brain → memory
  [70, 55, 90, 68],     // eyes → memory
  [130, 55, 110, 68],   // mouth → memory
  [100, 80, 100, 94],   // memory → heart
  [90, 100, 58, 100],   // heart → left hand
  [110, 100, 142, 100], // heart → right hand
  [100, 108, 100, 122], // heart → skeleton
  [90, 136, 76, 152],   // skeleton → left leg
  [110, 136, 124, 152], // skeleton → right leg
  [90, 130, 38, 130],   // skeleton → skill
  [110, 130, 162, 130], // skeleton → prompt
];

const lessonColors: Record<string, string> = {
  l01: "#3B82F6",  // blue
  l02: "#10B981",  // green
  l03: "#8B5CF6",  // purple
  l04: "#F59E0B",  // amber
  l05: "#8B5CF6",  // purple (permissions)
  l06: "#F59E0B",  // amber (compression)
  l07: "#10B981",  // green (executor)
  l08: "#8B5CF6",  // purple (ecosystem)
  l09: "#F59E0B",  // amber (skill)
  l10: "#F59E0B",  // amber (system prompt)
};

export default function AgentAnatomy() {
  const pathname = usePathname();
  const router = useRouter();
  const [hovered, setHovered] = useState(true);
  const [hoveredOrgan, setHoveredOrgan] = useState<string | null>(null);

  // Extract current lesson from pathname
  const match = pathname.match(/\/lessons\/(l\d+)/);
  const currentLesson = match ? match[1] : null;

  const isOrganActive = (organ: OrganDef) => {
    if (!organ.lesson) return false;
    return organ.lesson === currentLesson;
  };

  const getOrganColor = (organ: OrganDef) => {
    if (!organ.lesson) return "var(--color-text-tertiary)";
    if (isOrganActive(organ)) return lessonColors[organ.lesson] || "var(--color-amber)";
    if (hoveredOrgan && organs.find(o => o.id === hoveredOrgan)?.lesson === organ.lesson) {
      return lessonColors[organ.lesson] || "var(--color-amber)";
    }
    return "var(--color-text-tertiary)";
  };

  const isConnectionActive = (conn: [number, number, number, number]) => {
    if (!currentLesson) return false;
    // A connection is active if both endpoints are near active organs
    return organs.some(o => isOrganActive(o));
  };

  return (
    <motion.div
      className="fixed bottom-6 right-6 z-40 select-none"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1, duration: 0.4 }}
    >
      <motion.div
        className="relative rounded-2xl border cursor-pointer overflow-hidden"
        style={{
          background: "oklch(0.12 0.01 65 / 0.9)",
          borderColor: hovered ? "var(--color-border)" : "var(--color-border-subtle)",
          backdropFilter: "blur(12px)",
        }}
        animate={{
          width: hovered ? 220 : 72,
          height: hovered ? 210 : 72,
          opacity: hovered ? 1 : 0.6,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setHoveredOrgan(null); }}
      >
        {/* Collapsed state: just brain icon */}
        <AnimatePresence>
          {!hovered && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <span
                className="text-2xl"
                style={{
                  color: currentLesson ? lessonColors[currentLesson] : "var(--color-amber-dim)",
                  filter: currentLesson ? `drop-shadow(0 0 8px ${lessonColors[currentLesson]}66)` : "none",
                }}
              >
                ◈
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expanded state: full anatomy */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="p-2"
            >
              {/* Title */}
              <p className="text-[9px] font-semibold text-center mb-1 tracking-wider uppercase"
                style={{ color: "var(--color-text-tertiary)" }}>
                Agent 结构
              </p>

              <svg viewBox="0 0 200 180" width="204" height="184">
                {/* Connection lines */}
                {connections.map(([x1, y1, x2, y2], i) => (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={currentLesson ? `${lessonColors[currentLesson]}33` : "oklch(0.3 0.01 65)"}
                    strokeWidth={1}
                    strokeDasharray={currentLesson ? "none" : "2 3"}
                  />
                ))}

                {/* Organs */}
                {organs.map((organ) => {
                  const active = isOrganActive(organ);
                  const color = getOrganColor(organ);
                  const isHovered = hoveredOrgan === organ.id;

                  return (
                    <g
                      key={organ.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredOrgan(organ.id)}
                      onMouseLeave={() => setHoveredOrgan(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (organ.lesson) router.push(`/lessons/${organ.lesson}`);
                      }}
                    >
                      {/* Glow effect for active organs */}
                      {active && (
                        <circle
                          cx={organ.x}
                          cy={organ.y}
                          r={14}
                          fill={`${color}15`}
                          stroke={`${color}33`}
                          strokeWidth={0.5}
                        >
                          <animate
                            attributeName="r"
                            values="12;16;12"
                            dur="2s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.6;1;0.6"
                            dur="2s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}

                      {/* Organ character */}
                      <text
                        x={organ.x}
                        y={organ.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={organ.size || 13}
                        fill={color}
                        style={{
                          filter: active ? `drop-shadow(0 0 4px ${color}88)` : "none",
                          transition: "fill 0.3s, filter 0.3s",
                          fontFamily: "system-ui",
                        }}
                      >
                        {organ.char}
                      </text>

                      {/* Tooltip on hover */}
                      {isHovered && (
                        <g>
                          <rect
                            x={organ.x - 36}
                            y={organ.y - 24}
                            width={72}
                            height={16}
                            rx={4}
                            fill="oklch(0.18 0.01 65)"
                            stroke="oklch(0.28 0.01 65)"
                            strokeWidth={0.5}
                          />
                          <text
                            x={organ.x}
                            y={organ.y - 14}
                            textAnchor="middle"
                            fontSize={8}
                            fill={color}
                            fontFamily="var(--font-sans)"
                            fontWeight={500}
                          >
                            {organ.labelZh}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
