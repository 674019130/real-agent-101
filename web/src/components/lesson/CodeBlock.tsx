"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { codeToHtml } from "shiki";
import { motion, AnimatePresence } from "framer-motion";
import type { CodeAnnotation } from "@/data/lessons";

interface CodeBlockProps {
  code: string;
  lang?: string;
  annotations?: CodeAnnotation[];
}

// 自动检测代码语言
function detectLang(code: string): string {
  if (code.includes("def ") || code.includes("import ") || code.includes("async def") || (code.includes("class ") && code.includes("self"))) return "python";
  if (code.includes("function ") || code.includes("const ") || code.includes("=>")) return "typescript";
  if (code.includes("#!/bin/bash") || code.includes("$ ")) return "bash";
  return "python";
}

// 从注释文本中提取解释内容（去掉 # 前缀和多余空格）
function extractExplanation(commentText: string): string {
  return commentText
    .replace(/^[#\/\/\*]+\s*/, "")  // 去掉 # // /* 前缀
    .replace(/\s*\*\/\s*$/, "")     // 去掉 */ 后缀
    .replace(/^-+\s*/, "")          // 去掉 ── 装饰线
    .replace(/^[─—]+\s*/, "")
    .trim();
}

// Python 装饰器 / 关键字解释（点击触发）
const KEYWORD_EXPLANATIONS: Record<string, string> = {
  // 装饰器
  "@property": "将方法变成属性访问。调用时不需要加括号：obj.name 而不是 obj.name()。常用于只读属性或需要计算的属性。",
  "@abstractmethod": "标记抽象方法，子类必须实现这个方法。如果子类没有实现，实例化时会报 TypeError。配合 ABC 基类使用。",
  "@dataclass": "自动生成 __init__()、__repr__()、__eq__() 等方法。省去手写样板代码，适合纯数据类。",
  "@staticmethod": "静态方法，不需要 self 或 cls 参数。本质上就是放在类命名空间里的普通函数。",
  "@classmethod": "类方法，第一个参数是 cls（类本身）而不是 self（实例）。常用于工厂方法或替代构造函数。",
  // 关键字
  "ABC": "Abstract Base Class（抽象基类）。继承 ABC 的类不能直接实例化，必须由子类实现所有 @abstractmethod 标记的方法。",
  "async def": "定义异步函数（协程）。函数内部可以用 await 等待 IO 操作，不阻塞事件循环。必须在 async 上下文中调用。",
  "await": "等待一个异步操作完成。只能在 async def 内使用。执行到 await 时，事件循环可以去处理其他任务。",
  "yield": "将函数变成生成器。每次 yield 暂停函数执行并返回一个值，下次迭代时从暂停处继续。省内存，适合大数据流。",
  "async for": "异步迭代。用于遍历 AsyncGenerator 或 AsyncIterator，每次迭代可能涉及 IO 等待。",
  "asyncio.gather": "并发运行多个协程，等待全部完成后返回结果列表。不是并行（Python 有 GIL），而是交替执行 IO 等待。",
  "asyncio.to_thread": "把阻塞的同步函数丢到线程池执行，不阻塞事件循环。适合文件 IO 等无法用 async 的操作。",
  "**params": "接收任意关键字参数，打包成 dict。让函数签名更灵活——调用者可以传任何参数，函数内部按需取用。",
  "subprocess.run": "运行外部命令（子进程）。capture_output=True 捕获标准输出和错误，timeout 防止命令卡死。",
};

// 检查点击的文本是否匹配已知关键字
function findKeywordExplanation(text: string): { keyword: string; explanation: string } | null {
  const trimmed = text.trim();
  // 精确匹配装饰器
  for (const [kw, explanation] of Object.entries(KEYWORD_EXPLANATIONS)) {
    if (trimmed === kw || trimmed === kw.replace("@", "")) return { keyword: kw, explanation };
  }
  // 部分匹配：点击的 span 可能只包含关键字的一部分
  for (const [kw, explanation] of Object.entries(KEYWORD_EXPLANATIONS)) {
    if (kw.startsWith("@") && trimmed.startsWith("@") && kw.includes(trimmed)) return { keyword: kw, explanation };
    if (trimmed === kw.split(" ")[0] && kw.includes(" ")) return { keyword: kw, explanation };
  }
  return null;
}

/**
 * Parse shiki HTML output into individual line HTML strings.
 * Shiki wraps each line in <span class="line">...</span>.
 * We extract the full HTML for each line (including the wrapping span).
 */
function parseShikiLines(html: string): string[] {
  // Match each <span class="line">...</span> element
  // Shiki output structure: <pre ...><code ...><span class="line">...</span>\n...</code></pre>
  const lineRegex = /<span class="line">[^]*?<\/span>(?=<span class="line">|<\/code>)/g;

  // A more robust approach: split by line spans
  // First, extract the content inside <code>...</code>
  const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (!codeMatch) return [];

  const codeContent = codeMatch[1];

  // Split on line boundaries - each line is a <span class="line">
  const lines: string[] = [];
  let depth = 0;
  let currentLine = "";
  let inLineSpan = false;
  let i = 0;

  while (i < codeContent.length) {
    // Check for <span class="line">
    if (codeContent.startsWith('<span class="line">', i)) {
      if (inLineSpan && depth === 0) {
        // We were tracking a line and hit a new one - save the current
        lines.push(currentLine);
        currentLine = "";
      }
      inLineSpan = true;
      // Find the end of this opening tag
      const tagEnd = codeContent.indexOf(">", i);
      currentLine += codeContent.substring(i, tagEnd + 1);
      i = tagEnd + 1;
      depth++;
      continue;
    }

    if (inLineSpan) {
      // Check for closing </span>
      if (codeContent.startsWith("</span>", i)) {
        currentLine += "</span>";
        i += 7; // length of "</span>"
        depth--;
        if (depth === 0) {
          lines.push(currentLine);
          currentLine = "";
          inLineSpan = false;
        }
        continue;
      }

      // Check for nested <span ...>
      if (codeContent.startsWith("<span", i)) {
        const tagEnd = codeContent.indexOf(">", i);
        currentLine += codeContent.substring(i, tagEnd + 1);
        i = tagEnd + 1;
        depth++;
        continue;
      }

      currentLine += codeContent[i];
      i++;
    } else {
      i++;
    }
  }

  // Don't forget the last line
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Build chunk groups from lines and annotations.
 * Returns an array of chunks, each either annotated or plain.
 */
interface Chunk {
  lineHtmls: string[];
  annotation?: CodeAnnotation;
  startLine: number; // 1-based
  endLine: number;   // 1-based
}

function buildChunks(lines: string[], annotations: CodeAnnotation[]): Chunk[] {
  const totalLines = lines.length;
  if (totalLines === 0) return [];

  // Sort annotations by start line
  const sorted = [...annotations].sort((a, b) => a.lines[0] - b.lines[0]);

  const chunks: Chunk[] = [];
  let currentLine = 1; // 1-based

  for (const ann of sorted) {
    const [start, end] = ann.lines;
    // Clamp to valid range
    const clampedStart = Math.max(1, Math.min(start, totalLines));
    const clampedEnd = Math.max(clampedStart, Math.min(end, totalLines));

    // Add plain chunk for lines before this annotation
    if (currentLine < clampedStart) {
      chunks.push({
        lineHtmls: lines.slice(currentLine - 1, clampedStart - 1),
        startLine: currentLine,
        endLine: clampedStart - 1,
      });
    }

    // Add annotated chunk
    chunks.push({
      lineHtmls: lines.slice(clampedStart - 1, clampedEnd),
      annotation: ann,
      startLine: clampedStart,
      endLine: clampedEnd,
    });

    currentLine = clampedEnd + 1;
  }

  // Add remaining plain lines
  if (currentLine <= totalLines) {
    chunks.push({
      lineHtmls: lines.slice(currentLine - 1),
      startLine: currentLine,
      endLine: totalLines,
    });
  }

  return chunks;
}

function AnnotatedChunk({ chunk, onToggle }: {
  chunk: Chunk;
  onToggle: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const hasAnnotation = !!chunk.annotation;
  const chunkHtml = chunk.lineHtmls.join("\n");

  return (
    <div
      onMouseEnter={hasAnnotation ? () => setIsHovered(true) : undefined}
      onMouseLeave={hasAnnotation ? () => setIsHovered(false) : undefined}
      onClick={hasAnnotation ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
      style={{
        cursor: hasAnnotation ? "pointer" : "default",
        background: isHovered ? "oklch(0.78 0.16 75 / 0.05)" : "transparent",
        transition: "background 0.2s ease",
        borderRadius: "2px",
      }}
      dangerouslySetInnerHTML={{ __html: chunkHtml }}
    />
  );
}

export default function CodeBlock({ code, lang, annotations }: CodeBlockProps) {
  const [html, setHtml] = useState<string>("");
  const [toast, setToast] = useState<{ label: string; text: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const language = lang || detectLang(code);
  const hasAnnotations = annotations && annotations.length > 0;

  useEffect(() => {
    let cancelled = false;
    codeToHtml(code, { lang: language, theme: "vitesse-dark" }).then((r) => {
      if (!cancelled) setHtml(r);
    });
    return () => { cancelled = true; };
  }, [code, language]);

  // 显示 toast（自动 5s 消失，再次点击同一个会关闭）
  const showToast = useCallback((label: string, text: string) => {
    setToast((prev) => {
      // 点同一个 → 关闭
      if (prev && prev.label === label && prev.text === text) return null;
      return { label, text };
    });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  // 点击代码块区域 → 找到对应 annotation → 显示 toast
  const handleChunkClick = useCallback((chunk: Chunk) => {
    if (chunk.annotation) {
      showToast(chunk.annotation.label, chunk.annotation.explanation);
    }
  }, [showToast]);

  // 单击：检测装饰器 / 关键字
  const handleClick = useCallback((e: React.MouseEvent) => {
    const spanText = (e.target as HTMLElement).textContent || "";
    const kwMatch = findKeywordExplanation(spanText);
    if (kwMatch) {
      e.stopPropagation();
      showToast(kwMatch.keyword, kwMatch.explanation);
      return;
    }
    // 检测注释行（单击即可）
    const line = (e.target as HTMLElement).closest(".line") || (e.target as HTMLElement).parentElement;
    if (line) {
      const trimmed = (line.textContent || "").trim();
      if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
        const explanation = extractExplanation(trimmed);
        if (explanation && explanation.length > 3) {
          showToast("注释", explanation);
          return;
        }
      }
    }
  }, [showToast]);

  // Toast 组件（固定在代码块底部）
  const ToastOverlay = (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="sticky bottom-0 left-0 right-0 z-50"
          onClick={() => setToast(null)}
          style={{ cursor: "pointer" }}
        >
          <div
            className="flex items-start gap-2 mx-2 mb-2 rounded-lg shadow-xl"
            style={{
              background: "oklch(0.18 0.02 75)",
              border: "1px solid var(--color-amber-dim)",
              padding: "10px 14px",
              backdropFilter: "blur(8px)",
            }}
          >
            <span style={{ color: "var(--color-amber)", fontSize: 13, marginTop: 1, flexShrink: 0 }}>💡</span>
            <div style={{ minWidth: 0 }}>
              <div style={{
                color: "var(--color-amber)",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "var(--font-sans, system-ui, sans-serif)",
                marginBottom: 3,
              }}>
                {toast.label}
              </div>
              <div style={{
                color: "var(--color-text-secondary)",
                fontSize: 12,
                lineHeight: 1.6,
                fontFamily: "var(--font-sans, system-ui, sans-serif)",
              }}>
                {toast.text}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!html) {
    return (
      <pre
        className="rounded-lg p-4 text-[12px] leading-[1.65] overflow-x-auto font-mono"
        style={{
          background: "oklch(0.11 0.008 65)",
          border: "1px solid var(--color-border-subtle)",
          color: "var(--color-text-secondary)",
        }}
      >
        <code>{code}</code>
      </pre>
    );
  }

  // ── Annotated mode ──
  if (hasAnnotations) {
    const lines = parseShikiLines(html);
    const chunks = buildChunks(lines, annotations);

    return (
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-x-auto text-[12px] leading-[1.65] [&_code]:!font-mono"
        style={{ border: "1px solid var(--color-border-subtle)" }}
        onClick={handleClick}
      >
        <pre
          className="!p-4 !m-0 !rounded-lg"
          style={{ background: "oklch(0.11 0.008 65)" }}
        >
          <code>
            {chunks.map((chunk, i) => (
              <AnnotatedChunk
                key={`${chunk.startLine}-${chunk.endLine}`}
                chunk={chunk}
                onToggle={() => handleChunkClick(chunk)}
              />
            ))}
          </code>
        </pre>
        {ToastOverlay}
      </div>
    );
  }

  // ── Default mode ──
  return (
    <div
      ref={containerRef}
      className="relative rounded-lg overflow-x-auto text-[12px] leading-[1.65] [&_pre]:!p-4 [&_pre]:!m-0 [&_pre]:!rounded-lg [&_pre]:!bg-[oklch(0.11_0.008_65)] [&_code]:!font-mono"
      style={{ border: "1px solid var(--color-border-subtle)" }}
      onClick={handleClick}
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {ToastOverlay}
    </div>
  );
}
