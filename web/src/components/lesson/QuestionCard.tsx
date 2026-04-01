"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Terminal } from "lucide-react";
import type { Question } from "@/data/lessons";
import PracticeInput from "./PracticeInput";

function TypewriterText({ text, color, onComplete }: { text: string; color: string; onComplete?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    idx.current = 0;
    setDisplayed("");
    setDone(false);

    const interval = setInterval(() => {
      idx.current++;
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) {
        clearInterval(interval);
        setDone(true);
        onComplete?.();
      }
    }, 18);

    return () => clearInterval(interval);
  }, [text, onComplete]);

  return (
    <span>
      {displayed}
      {!done && (
        <span className="cursor-blink" style={{ color }} />
      )}
    </span>
  );
}

export default function QuestionCard({
  question,
  index,
  lessonId,
  accentColor,
  onAttempt,
}: {
  question: Question;
  index: number;
  lessonId: string;
  accentColor: string;
  onAttempt?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [typewriting, setTypewriting] = useState(false);

  const handleReveal = () => {
    if (revealed) {
      setRevealed(false);
      setTypewriting(false);
    } else {
      setRevealed(true);
      setTypewriting(true);
    }
  };

  return (
    <div
      className="relative rounded-xl p-5 border transition-all duration-300"
      style={{
        background: "var(--color-bg-raised)",
        borderColor: "var(--color-border-subtle)",
      }}
    >
      {/* Question */}
      <div className="flex items-start gap-3.5 mb-4">
        <span
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold mt-0.5"
          style={{ background: `${accentColor}18`, color: accentColor }}
        >
          {index + 1}
        </span>
        <p className="text-[var(--color-text)] text-[15px] leading-relaxed font-medium pt-0.5">
          {question.question}
        </p>
      </div>

      {/* Practice input */}
      <div className="ml-[42px] mb-4">
        <PracticeInput
          lessonId={lessonId}
          questionId={question.id}
          referenceAnswer={question.answer}
          accentColor={accentColor}
          onSubmit={onAttempt}
        />
      </div>

      {/* Reveal toggle */}
      <div className="ml-[42px]">
        <button
          onClick={handleReveal}
          className="flex items-center gap-2 text-sm transition-colors duration-200 cursor-pointer group/reveal"
          style={{ color: revealed ? accentColor : "var(--color-text-tertiary)" }}
        >
          <motion.span
            animate={{ rotate: revealed ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight size={14} />
          </motion.span>
          <span className="group-hover/reveal:underline underline-offset-2">
            {revealed ? "收起参考答案" : "先想想再看答案"}
          </span>
        </button>

        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-lg overflow-hidden"
                style={{ background: "var(--color-bg)", border: `1px solid ${accentColor}15` }}>
                {/* Terminal header */}
                <div className="flex items-center gap-2 px-3 py-1.5 border-b"
                  style={{ borderColor: "var(--color-border-subtle)" }}>
                  <Terminal size={10} style={{ color: accentColor }} />
                  <span className="text-[10px] font-mono" style={{ color: "var(--color-text-tertiary)" }}>
                    reference_answer.md
                  </span>
                </div>
                {/* Answer content with typewriter */}
                <div className="px-3.5 py-3 text-sm leading-relaxed font-mono"
                  style={{ color: "var(--color-text-secondary)", fontSize: "12.5px", lineHeight: "1.7" }}>
                  <span style={{ color: accentColor, opacity: 0.5 }}>{'> '}</span>
                  {typewriting ? (
                    <TypewriterText
                      text={question.answer}
                      color={accentColor}
                      onComplete={() => setTypewriting(false)}
                    />
                  ) : (
                    question.answer
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
