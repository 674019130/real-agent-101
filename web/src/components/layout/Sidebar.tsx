"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { lessons } from "@/data/lessons";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 hidden lg:block">
      <div className="sticky top-20 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-3 px-3">
          课程
        </p>
        {lessons.map((lesson) => {
          const active = pathname === `/lessons/${lesson.id}`;
          return (
            <Link
              key={lesson.id}
              href={`/lessons/${lesson.id}`}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all"
              style={{
                background: active ? "var(--color-bg-surface)" : "transparent",
                color: active ? "var(--color-text)" : "var(--color-text-secondary)",
              }}
            >
              <span
                className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{
                  background: active ? `${lesson.color}22` : "var(--color-bg-surface)",
                  color: active ? lesson.color : "var(--color-text-tertiary)",
                }}
              >
                {lesson.number}
              </span>
              <span className="truncate">{lesson.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
