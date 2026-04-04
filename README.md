# Real Agent 101

从零构建一个类 Claude Code 的 CLI Agent。不用 SDK，从 raw API 开始，逐课搭建。

## 这是什么

一个教学项目。通过对话式课程，一节一节地从零实现一个能用的 coding agent。每节课有一个具体目标，构建一部分功能，讨论设计决策，并对比 Claude Code 的生产实现。

**最终目标**：一个能读写文件、执行命令、搜索代码、管理上下文、控制权限的 CLI Agent。

## 项目结构

```
real-agent-101/
├── src/                    # Agent 实现代码（Python）
│   ├── main.py             # CLI 入口 + agent loop
│   ├── api.py              # raw httpx 调 OpenAI API
│   ├── types.py            # Tool 基类 + CompactConfig
│   ├── tools/              # 工具实现
│   │   ├── bash.py         # Bash（黑名单/超时/截断）
│   │   ├── read.py         # 文件读取（行号/offset/limit）
│   │   ├── edit.py         # 文件编辑（old→new 唯一匹配）
│   │   ├── write.py        # 文件写入（全文覆盖）
│   │   ├── todo.py         # Todo（JSON 持久化）
│   │   └── registry.py     # 工具注册表 + dispatch
│   └── context/
│       └── compact.py      # 上下文压缩
└── web/                    # 课程网站（Next.js）
    └── src/
        ├── app/            # 页面路由
        ├── components/     # UI 组件（时序图/对比表/流程图/结构图）
        └── data/           # 课程内容数据
```

## 阶段里程碑

| Phase | 目标 | 状态 |
|-------|------|------|
| 1 | **能对话** — Agent loop、流式 API、消息历史、压缩骨架 | ✅ |
| 2 | **定方向** — Agent 类型选型、运行环境分析、工具集设计 | ✅ |
| 3 | **有手有眼** — 实现工具系统（Bash、文件读写、搜索） | ✅ |
| 4 | **有脑子** — System prompt 工程、上下文管理 | ✅ |
| 5 | **可信赖** — 权限、持久化、子 agent、hooks | ✅ |
| 6 | **能干活** — 真实项目实战 + gap analysis | |

## 课程记录

### L01: Agent 的雏形 — 一个会聊天的 while 循环

搭建 agent 骨架。包含完整源码走读：Tool 基类、SSE 流式解析、Agent Loop 双层循环结构。

关键概念：`messages` 列表是唯一核心状态 / `finish_reason` 是控制信号 / chatbot → agent 的分水岭是 `tool_calls` 分支

### L02: Agent 跑在哪 — 运行环境决定能力边界

三种环境对比（Local / Cloud / Hybrid），附对比表。选择 Local Agent 为主线。

关键概念：环境决定工具集 / 信任边界差异 / 环境信息收集策略（便宜的提前收集，昂贵的按需探测）

### L03: 工具集设计 — 通用场景 vs 垂类场景

5 个通用工具实现 + 3 个垂类伪代码。附 Write vs Edit 对比表、Bash 安全层源码、Edit 唯一性检查源码。

关键概念：通用需要的工具反而更少 / Description 是给模型看的 prompt / 错误要 actionable / old_string→new_string 比行号更鲁棒

### L04: 代码走读 — 一次请求的完整生命周期

10 步请求时序 + 时序图。全量源码走读含 tool_calls 分块拼接、权限检查、REJECTED 消息处理。

关键概念：1,252 行 = Claude Code 的 0.24% / 双层 while 循环 / 内层循环是 agent 的心脏

### L05: 权限系统 — 从 y/n 到分级控制

三级权限（AUTO / ASK / DENY）+ 路径边界检查 + bypass-immune + 全局模式（normal/auto/yolo）。

关键概念：Tool.check_permission() 每个工具自己声明权限 / 可逆性决定 ASK vs DENY / bypass-immune 即使 yolo 也拦不住

延伸讨论：Glob 规则、AI 自动审批（Yolo Classifier）、Hook 扩展点、Prompt Engineering 的两种类型（能力补偿 vs 策略定义）

### L06: 上下文压缩优化 — 五层压缩策略

5 层从轻到重：时间微压缩 → 缓存微压缩 → Session Memory → 全量压缩 → API 原生。压缩前持久化到磁盘，system prompt 声明路径让模型用 Read 工具访问。

关键概念：KV Cache 过期时清理是零成本 / cache_edits 服务端删除不破坏缓存 / Session Memory 零 API 调用压缩 / 不加新工具，只加信息

专题讨论：Mid-Stream Tool Execution（源码验证）— content_block_stop 时执行，非 concurrent_safe 阻塞队列保证顺序

### L07: 并发工具执行 — StreamingToolExecutor

队列式执行器，SSE 流中 tool_call 完整即提交执行。concurrent_safe 工具并行，非安全工具阻塞队列串行。

生产特性：bash 错误级联（终止排队的写操作，只读不受影响）、统一超时（bash 30s / 其他 120s）、progress 回调

关键发现：is_concurrent_safe 有三重作用——权限标记（L05）、调度标记（并行/串行）、级联标记（是否受 cascade 影响）

### L08: 错误恢复与生态扩展 — retry / hooks / sub-agent

API 层指数退避重试（1/2/4s，max 3），只重试 5xx/timeout/connection，4xx 不重试。环境信息收集（静态缓存 + 动态每次重取）。Hook 系统（PreToolUse/PostToolUse/Notification，JSON stdin/stdout，5s 超时，fail-open，可改参数和输出）。Sub-agent 工具继承父工具（除自身）、独立上下文、max_turns 限制。

关键概念：去掉 jsonschema 校验（信任模型，和 CC 一致）/ Hook 的价值在集成深度而非允许/拒绝 / Sub-agent 隔离上下文防污染

### L09: Skill & Command — 渐进式披露

Skill 系统扫描 `.agent/skills/*.md`，Layer 1 把 name+description 注入 system prompt（~50 tokens/skill），Layer 2 模型按需 call Skill tool 加载完整内容（~2K tokens）。Command 系统 `.agent/commands/*.md`，用户 `/name` 触发，模板展开成 user message（无渐进披露，用户触发即加载）。

关键概念：40x token 节省 / enum schema 约束 skill 名称 / YAML front matter 零依赖解析 / Skill 是"能力"、Command 是"模板"

### L10: System Prompt 集成 — 9 组件组装

build_system_prompt() 在启动时组装 9 个组件：角色/工具指南/环境/模型/持久化路径/git 快照/CLAUDE.md/Skills/Commands。一次组装永不变（KV cache 友好）。动态信息（日期）通过 `<system-reminder>` 每轮注入到 user message，避免缓存失效。

新增 CLAUDE.md loader（用户全局 trusted + 项目级标注 untrusted）、tool guide（策略定义型 prompt，防止 bash 代替一切）、git status snapshot、Tavily web_search 工具。

关键概念：静态/动态分离 / primacy effect（角色在最前） / 来源标注让模型判断指令可信度 / 策略定义型 vs 能力补偿型 prompt

## 课程网站

交互式课程网站，包含源码走读、时序图、对比表、流程图、Agent 结构图、思考题（隐藏答案 + LLM 评分）。

```bash
cd web && npm install && npm run dev -- -p 4002
# 需设置 OPENAI_API_KEY 环境变量（用于思考题 LLM 评分）
```

## Agent 技术栈

- Python 3.11+
- httpx（raw HTTP，不用 SDK）
- rich（终端美化）

## 快速开始

```bash
cd real-agent-101
python -m venv .venv
source .venv/bin/activate
pip install httpx rich python-dotenv

export OPENAI_API_KEY="your-key"
python -m src.main
```

## 前置知识

- [learn-real-claude-code](https://github.com/674019130/learn-real-claude-code) — 逆向分析 Claude Code 512K 行源码
- Claude Agent SDK 21 个 Python 示例实现
