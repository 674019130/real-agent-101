"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  User,
  GraduationCap,
  FileCode2,
  GitCompareArrows,
  Lightbulb,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import QuestionCard from "@/components/lesson/QuestionCard";
import { getLessonById, lessons } from "@/data/lessons";

const sectionIcons: Record<string, React.ReactNode> = {
  student: <User size={14} />,
  teacher: <GraduationCap size={14} />,
  output: <FileCode2 size={14} />,
  comparison: <GitCompareArrows size={14} />,
  insight: <Lightbulb size={14} />,
};

const sectionLabels: Record<string, string> = {
  student: "学员",
  teacher: "老师",
  output: "产出",
  comparison: "对比",
  insight: "洞察",
};

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const lesson = getLessonById(id);

  if (!lesson) {
    return (
      <>
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <p className="text-[var(--color-text-secondary)]">课程不存在</p>
          <Link href="/" className="text-[var(--color-amber)] text-sm mt-4 inline-block">
            返回首页
          </Link>
        </div>
      </>
    );
  }

  const currentIndex = lessons.findIndex((l) => l.id === id);
  const prev = currentIndex > 0 ? lessons[currentIndex - 1] : null;
  const next = currentIndex < lessons.length - 1 ? lessons[currentIndex + 1] : null;

  return (
    <>
      <Header />
      <div className="max-w-6xl mx-auto px-6 flex gap-10 pt-8 pb-24">
        <Sidebar />

        <main className="flex-1 min-w-0 max-w-3xl">
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors mb-8"
          >
            <ArrowLeft size={12} /> 全部课程
          </Link>

          {/* Title banner */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-12"
          >
            <div className="flex items-center gap-3 mb-4">
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: `${lesson.color}15`,
                  color: lesson.color,
                }}
              >
                L{String(lesson.number).padStart(2, "0")}
              </span>
              <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Phase {lesson.phaseNumber} · {lesson.phase}
              </span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {lesson.title}
            </h1>
            <p className="text-lg text-[var(--color-text-secondary)]">
              {lesson.subtitle}
            </p>

            <div
              className="mt-6 px-4 py-3 rounded-lg text-sm"
              style={{
                background: `${lesson.color}08`,
                borderLeft: `3px solid ${lesson.color}`,
                color: "var(--color-text-secondary)",
              }}
            >
              <span className="font-medium" style={{ color: lesson.color }}>
                目标
              </span>
              <span className="mx-2">—</span>
              {lesson.objective}
            </div>
          </motion.div>

          {/* Content sections */}
          <div className="space-y-10 mb-16">
            {lesson.sections.map((section, i) => (
              <motion.section
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.35 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span
                    className="w-6 h-6 rounded flex items-center justify-center"
                    style={{
                      background:
                        section.type === "teacher"
                          ? "var(--color-amber-glow)"
                          : section.type === "insight"
                            ? `${lesson.color}15`
                            : "var(--color-bg-surface)",
                      color:
                        section.type === "teacher"
                          ? "var(--color-amber)"
                          : section.type === "insight"
                            ? lesson.color
                            : "var(--color-text-tertiary)",
                    }}
                  >
                    {sectionIcons[section.type]}
                  </span>
                  <h2 className="text-sm font-semibold text-[var(--color-text)]">
                    {section.title}
                  </h2>
                  <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">
                    {sectionLabels[section.type]}
                  </span>
                </div>

                <div
                  className="space-y-2.5 pl-8"
                  style={
                    section.type === "teacher"
                      ? { borderLeft: "2px solid var(--color-amber-glow)" }
                      : section.type === "insight"
                        ? { borderLeft: `2px solid ${lesson.color}33` }
                        : {}
                  }
                >
                  {section.items.map((item, j) => (
                    <p
                      key={j}
                      className="text-sm leading-relaxed"
                      style={{
                        color:
                          section.type === "insight"
                            ? "var(--color-text)"
                            : "var(--color-text-secondary)",
                        paddingLeft:
                          section.type === "teacher" || section.type === "insight"
                            ? "12px"
                            : "0",
                        fontWeight: section.type === "insight" ? 500 : 400,
                      }}
                    >
                      {section.type !== "insight" && (
                        <span className="text-[var(--color-text-tertiary)] mr-2">
                          ›
                        </span>
                      )}
                      {item}
                    </p>
                  ))}
                </div>
              </motion.section>
            ))}
          </div>

          {/* Thinking questions */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <div className="flex items-center gap-2 mb-6">
              <span className="text-[var(--color-amber)]">
                <Lightbulb size={16} />
              </span>
              <h2 className="text-lg font-semibold">思考题</h2>
            </div>

            <div className="space-y-8">
              {lesson.questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  lessonId={lesson.id}
                  accentColor={lesson.color}
                />
              ))}
            </div>
          </motion.section>

          {/* Prev/Next navigation */}
          <div className="flex items-center justify-between mt-16 pt-8 border-t border-[var(--color-border-subtle)]">
            {prev ? (
              <Link
                href={`/lessons/${prev.id}`}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              >
                ← L{String(prev.number).padStart(2, "0")} {prev.title}
              </Link>
            ) : (
              <div />
            )}
            {next ? (
              <Link
                href={`/lessons/${next.id}`}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              >
                L{String(next.number).padStart(2, "0")} {next.title} →
              </Link>
            ) : (
              <div />
            )}
          </div>
        </main>
      </div>
    </>
  );
}
