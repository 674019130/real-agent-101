"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Terminal, CheckCircle2, Circle, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import { lessons, phases } from "@/data/lessons";

function PhaseIcon({ status }: { status: string }) {
  if (status === "done")
    return <CheckCircle2 size={16} className="text-[var(--color-green)]" />;
  if (status === "active")
    return <Loader2 size={16} className="text-[var(--color-amber)]" />;
  return <Circle size={16} className="text-[var(--color-text-tertiary)]" />;
}

export default function Home() {
  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-6">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pt-24 pb-16"
        >
          <div className="flex items-center gap-2 mb-6">
            <Terminal size={14} className="text-[var(--color-amber)]" />
            <span className="text-xs font-medium tracking-wide text-[var(--color-amber)]">
              101 COURSE
            </span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
            <span className="text-[var(--color-text)]">Real Agent 101</span>
            <br />
            <span className="text-[var(--color-text-secondary)]">从零构建 Agent</span>
          </h1>

          <p className="text-[var(--color-text-secondary)] text-[15px] leading-relaxed max-w-lg">
            不用 SDK，从 raw API 开始。每节课实现一个功能，讨论设计决策，对比
            Claude Code 生产实现。最终目标：一个能读写文件、执行命令、管理上下文的
            CLI Agent。
          </p>
        </motion.section>

        {/* Phases */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="pb-16"
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-6">
            阶段里程碑
          </h2>
          <div className="space-y-0">
            {phases.map((phase, i) => (
              <div key={phase.number} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <PhaseIcon status={phase.status} />
                  {i < phases.length - 1 && (
                    <div
                      className="w-px flex-1 min-h-8"
                      style={{
                        background:
                          phase.status === "done"
                            ? "var(--color-green)"
                            : "var(--color-border-subtle)",
                      }}
                    />
                  )}
                </div>
                <div className="pb-6 -mt-0.5">
                  <p
                    className="text-sm"
                    style={{
                      color:
                        phase.status === "upcoming"
                          ? "var(--color-text-tertiary)"
                          : "var(--color-text)",
                    }}
                  >
                    <span className="font-medium">Phase {phase.number}</span>
                    <span className="mx-2 text-[var(--color-border)]">—</span>
                    {phase.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Lesson cards */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="pb-24"
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-6">
            课程
          </h2>
          <div className="space-y-3">
            {lessons.map((lesson, i) => (
              <motion.div
                key={lesson.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
              >
                <Link
                  href={`/lessons/${lesson.id}`}
                  className="group block rounded-xl p-5 border transition-all duration-200"
                  style={{
                    background: "var(--color-bg-raised)",
                    borderColor: "var(--color-border-subtle)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${lesson.color}44`;
                    e.currentTarget.style.background = "var(--color-bg-surface)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                    e.currentTarget.style.background = "var(--color-bg-raised)";
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <span
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{
                          background: `${lesson.color}15`,
                          color: lesson.color,
                        }}
                      >
                        {String(lesson.number).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="text-[15px] font-semibold text-[var(--color-text)] mb-1">
                          {lesson.title}
                        </h3>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                          {lesson.subtitle}
                        </p>
                      </div>
                    </div>
                    <ArrowRight
                      size={16}
                      className="mt-1.5 text-[var(--color-text-tertiary)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                    />
                  </div>

                  <div className="flex items-center gap-3 mt-3.5 ml-12">
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{
                        background: `${lesson.color}15`,
                        color: lesson.color,
                      }}
                    >
                      Phase {lesson.phaseNumber}
                    </span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {lesson.questions.length} 道思考题
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </main>
    </>
  );
}
