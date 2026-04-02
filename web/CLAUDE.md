@AGENTS.md

# Real Agent 101 — 课程网站

## 项目概述

Real Agent 101 的教学网站，展示从零构建 Agent 的 4 节课内容（持续增长）。

## 技术栈

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4（oklch 色彩系统）
- Framer Motion（动画）
- Lucide React（图标）

## 目录结构

```
web/src/
├── app/
│   ├── page.tsx                    # 首页（Hero + 里程碑 + 课程卡片）
│   ├── layout.tsx                  # 全局 layout
│   ├── lessons/[id]/page.tsx       # 课程详情页（动态路由）
│   └── api/evaluate/route.ts       # LLM 评分 API（代理 OpenAI）
├── components/
│   ├── layout/
│   │   ├── Header.tsx              # 顶栏（logo + GitHub 链接）
│   │   └── Sidebar.tsx             # 侧边栏课程导航
│   ├── lesson/
│   │   ├── QuestionCard.tsx        # 思考题（折叠答案 + 打字机效果）
│   │   ├── PracticeInput.tsx       # 练习输入 + LLM 流式评价
│   │   ├── SequenceDiagram.tsx     # 时序图组件
│   │   ├── CompareTable.tsx        # 对比表组件
│   │   └── FlowDiagram.tsx         # 流程图组件
│   └── AgentAnatomy.tsx            # Agent 结构图浮窗（右下角）
├── data/
│   └── lessons.ts                  # 所有课程内容（结构化数据）
└── lib/
    └── evaluate.ts                 # /api/evaluate 客户端封装
```

## 设计系统

- 暗色主题，oklch 色彩
- 主色调：amber (oklch 0.78 0.16 75)
- 课程颜色：L01 蓝 / L02 绿 / L03 紫 / L04 琥珀
- 字体：DM Sans（标题）+ JetBrains Mono（代码）

## 内容数据模型

课程内容在 `data/lessons.ts`，支持以下 section 类型：
- `student` / `teacher` / `insight` — 文本段落
- `code` — 源码块（带中文注释）
- `output` / `comparison` — 列表
- `sequence` — 时序图（actors + steps）
- `table` — 对比表（headers + rows）
- `flow` — 流程图（flowSteps + direction）

ContentItem 支持 `key: true` 标记重要内容（琥珀色高亮 + KEY 标签）。

## 环境变量

```
OPENAI_API_KEY=xxx        # 必需，LLM 评分用
LLM_MODEL=gpt-4o          # 可选，默认 gpt-4o
LLM_BASE_URL=xxx          # 可选，默认 OpenAI
```

## 开发

```bash
cd web
npm install
npm run dev -- -p 4002
```

## 注意事项

- 课程内容中的中文引号「」不要用 ""，会导致 TS 解析错误
- Agent 结构图默认展开，鼠标移开收起
- 思考题答案用打字机效果展示，LLM 评价用 terminal 风格
