"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import { evaluateAnswer } from "@/lib/evaluate";

export default function PracticeInput({
  lessonId,
  questionId,
  referenceAnswer,
}: {
  lessonId: string;
  questionId: string;
  referenceAnswer: string;
}) {
  const [input, setInput] = useState("");
  const [evaluation, setEvaluation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const evalRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setEvaluation("");
    setError("");

    try {
      await evaluateAnswer(lessonId, questionId, input, referenceAnswer, (chunk) => {
        setEvaluation((prev) => prev + chunk);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "评价失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="写下你的理解..."
          rows={2}
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border-subtle)] rounded-lg px-3.5 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] resize-none focus:outline-none focus:border-[var(--color-amber-dim)] transition-colors"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || loading}
          className="absolute bottom-2.5 right-2.5 p-1.5 rounded-md transition-all disabled:opacity-30 cursor-pointer"
          style={{
            background: input.trim() ? "var(--color-amber-glow)" : "transparent",
            color: input.trim() ? "var(--color-amber)" : "var(--color-text-tertiary)",
          }}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>

      <AnimatePresence>
        {(evaluation || error) && (
          <motion.div
            ref={evalRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-sm leading-relaxed rounded-lg px-3.5 py-3"
            style={{
              background: error ? "oklch(0.25 0.05 25)" : "var(--color-bg)",
              color: error ? "oklch(0.75 0.12 25)" : "var(--color-text-secondary)",
              border: `1px solid ${error ? "oklch(0.3 0.05 25)" : "var(--color-border-subtle)"}`,
            }}
          >
            <span className="whitespace-pre-wrap">{error || evaluation}</span>
            {loading && <span className="cursor-blink" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
