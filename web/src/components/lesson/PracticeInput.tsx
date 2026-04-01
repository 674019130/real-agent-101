"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Terminal } from "lucide-react";
import { evaluateAnswer } from "@/lib/evaluate";

function ThinkingDots({ color }: { color: string }) {
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block w-1 h-1 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  );
}

export default function PracticeInput({
  lessonId,
  questionId,
  referenceAnswer,
  accentColor = "var(--color-amber)",
  onSubmit,
}: {
  lessonId: string;
  questionId: string;
  referenceAnswer: string;
  accentColor?: string;
  onSubmit?: () => void;
}) {
  const [input, setInput] = useState("");
  const [evaluation, setEvaluation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "thinking" | "streaming" | "done">("idle");
  const evalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll evaluation into view
  useEffect(() => {
    if (evaluation && evalRef.current) {
      evalRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [evaluation]);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setEvaluation("");
    setError("");
    setPhase("thinking");
    onSubmit?.();

    // Brief thinking delay for dramatic effect
    await new Promise((r) => setTimeout(r, 800));
    setPhase("streaming");

    try {
      await evaluateAnswer(lessonId, questionId, input, referenceAnswer, (chunk) => {
        setEvaluation((prev) => prev + chunk);
      });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "评价失败，请检查 OPENAI_API_KEY 配置");
      setPhase("done");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative group/input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="写下你的理解... (⌘+Enter 提交)"
          rows={2}
          className="w-full bg-[var(--color-bg)] border rounded-lg px-3.5 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] resize-none focus:outline-none transition-all duration-200"
          style={{
            borderColor: input.trim() ? `${accentColor}33` : "var(--color-border-subtle)",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = `${accentColor}55`; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = input.trim() ? `${accentColor}33` : "var(--color-border-subtle)"; }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || loading}
          className="absolute bottom-2.5 right-2.5 p-1.5 rounded-md transition-all duration-200 disabled:opacity-20 cursor-pointer"
          style={{
            background: input.trim() && !loading ? `${accentColor}18` : "transparent",
            color: input.trim() ? accentColor : "var(--color-text-tertiary)",
          }}
        >
          <Send size={14} />
        </button>
      </div>

      <AnimatePresence>
        {(phase !== "idle" || error) && (
          <motion.div
            ref={evalRef}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="rounded-lg overflow-hidden"
            style={{
              background: error ? "oklch(0.16 0.03 25)" : "var(--color-bg)",
              border: `1px solid ${error ? "oklch(0.25 0.05 25)" : "var(--color-border-subtle)"}`,
            }}
          >
            {/* Terminal header */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b"
              style={{ borderColor: error ? "oklch(0.25 0.05 25)" : "var(--color-border-subtle)" }}>
              <Terminal size={10} style={{ color: error ? "oklch(0.65 0.12 25)" : accentColor }} />
              <span className="text-[10px] font-mono" style={{ color: "var(--color-text-tertiary)" }}>
                {error ? "error" : phase === "done" ? "evaluation complete" : "evaluating"}
              </span>
              {phase === "thinking" && <ThinkingDots color={accentColor} />}
            </div>

            {/* Content */}
            <div className="px-3.5 py-3 text-sm leading-relaxed"
              style={{ color: error ? "oklch(0.75 0.12 25)" : "var(--color-text-secondary)" }}>

              {phase === "thinking" && !error && (
                <div className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                  <span style={{ color: accentColor }}>{'>'}</span>
                  正在分析你的回答
                  <ThinkingDots color={accentColor} />
                </div>
              )}

              {(phase === "streaming" || phase === "done") && !error && (
                <div className="whitespace-pre-wrap">
                  {evaluation}
                  {phase === "streaming" && <span className="cursor-blink" />}
                </div>
              )}

              {error && (
                <span className="whitespace-pre-wrap">{error}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
