"use client";

import { motion } from "framer-motion";

export interface TableRow {
  cells: string[];
  highlight?: boolean;
}

export default function CompareTable({
  headers,
  rows,
  accentColor,
  caption,
}: {
  headers: string[];
  rows: TableRow[];
  accentColor: string;
  caption?: string;
}) {
  return (
    <div className="my-4 rounded-lg overflow-hidden" style={{
      background: "oklch(0.11 0.008 65)",
      border: "1px solid var(--color-border-subtle)",
    }}>
      {caption && (
        <div className="px-3.5 py-2 border-b text-[10px] font-semibold uppercase tracking-wider"
          style={{ borderColor: "var(--color-border-subtle)", color: "var(--color-text-tertiary)" }}>
          {caption}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: i === 0 ? "var(--color-text-tertiary)" : accentColor }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              style={{
                borderBottom: i < rows.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                background: row.highlight ? `${accentColor}08` : "transparent",
              }}
            >
              {row.cells.map((cell, j) => (
                <td key={j} className="px-3.5 py-2.5 text-[12.5px] leading-relaxed"
                  style={{
                    color: j === 0 ? "var(--color-text)" : "var(--color-text-secondary)",
                    fontWeight: j === 0 ? 500 : 400,
                  }}>
                  {cell}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
