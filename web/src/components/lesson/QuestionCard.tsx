"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { Question } from "@/data/lessons";
import PracticeInput from "./PracticeInput";

export default function QuestionCard({
  question,
  index,
  lessonId,
  accentColor,
}: {
  question: Question;
  index: number;
  lessonId: string;
  accentColor: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="group">
      {/* Question */}
      <div className="flex items-start gap-4 mb-4">
        <span
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5"
          style={{ background: `${accentColor}22`, color: accentColor }}
        >
          {index + 1}
        </span>
        <p className="text-[var(--color-text)] text-[15px] leading-relaxed font-medium">
          {question.question}
        </p>
      </div>

      {/* Practice input */}
      <div className="ml-11 mb-4">
        <PracticeInput
          lessonId={lessonId}
          questionId={question.id}
          referenceAnswer={question.answer}
        />
      </div>

      {/* Reveal toggle */}
      <div className="ml-11">
        <button
          onClick={() => setRevealed(!revealed)}
          className="flex items-center gap-2 text-sm transition-colors duration-200 cursor-pointer"
          style={{ color: revealed ? accentColor : "var(--color-text-secondary)" }}
        >
          <motion.span
            animate={{ rotate: revealed ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight size={14} />
          </motion.span>
          {revealed ? "收起参考答案" : "先想想再看答案"}
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
              <div
                className="mt-3 pl-4 py-3 text-sm leading-relaxed"
                style={{
                  borderLeft: `2px solid ${accentColor}44`,
                  color: "var(--color-text-secondary)",
                }}
              >
                {question.answer}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
