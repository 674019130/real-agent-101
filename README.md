# Real Agent 101

从零构建一个类 Claude Code 的 CLI Agent。不用 SDK，从 raw API 开始，逐课搭建。

## 这是什么

一个教学项目。通过对话式课程，一节一节地从零实现一个能用的 coding agent。每节课有一个具体目标，构建一部分功能，讨论设计决策，并对比 Claude Code 的生产实现。

**最终目标**：一个能读写文件、执行命令、搜索代码、管理上下文、控制权限的 CLI Agent。

## 阶段里程碑

| Phase | 目标 | 状态 |
|-------|------|------|
| 1 | **能对话** — Agent loop、流式 API、消息历史、压缩骨架 | ✅ |
| 2 | **定方向** — Agent 类型选型、运行环境分析、工具集设计 | 🔄 |
| 3 | **有手有眼** — 实现工具系统（Bash、文件读写、搜索） | |
| 4 | **有脑子** — System prompt 工程、上下文管理 | |
| 5 | **可信赖** — 权限、持久化、子 agent、hooks | |
| 6 | **能干活** — 真实项目实战 + gap analysis | |

## 课程记录

### L01: Agent 的雏形 — 一个会聊天的 while 循环

**目标**：搭建 agent 骨架 — while 循环 + raw API 调用 + 流式输出 + 消息历史累积

**构建内容**：
- Agent loop（`main.py`）：读输入 → 构建消息 → 调 API → 流式输出 → 追加历史 → 循环
- Raw API 客户端（`api.py`）：httpx 直接调 OpenAI SSE 流式接口
- Tool 基类（`types.py`）：name / description / input_schema / is_concurrent_safe / execute() / render()
- 工具注册表（`tools/registry.py`）：注册、查找、dispatch
- 上下文压缩（`context/compact.py`）：80% 阈值触发，整体压缩为 2 条消息

**关键讨论**：
- `finish_reason` 是 agent loop 的控制信号 — `stop` vs `tool_calls` vs `length`
- 压缩时机在"发 API 前"，不是"工具调用后"
- 压缩输出不需要保持原消息结构 — 纯文本摘要塞进固定 2 条消息
- 这还不是 agent，只是 chatbot。分水岭是 `tool_calls` 分支接上的那一刻

### L02: Agent 跑在哪 — 运行环境决定能力边界

**目标**：在写工具之前，先想清楚 agent 是什么类型、跑在什么环境

**三种运行环境**：
| 类型 | 术语 | 代表 |
|------|------|------|
| 客户端 | Local Agent | Claude Code, Cursor |
| 云端 | Cloud-hosted Agent | Manus, Devin |
| 混合 | Hybrid Agent | Claude Code Remote |

**关键讨论**：
- 环境决定工具集，工具集决定能力边界
- Local Agent：直接访问本地资源，Bash 是万能工具，需要权限系统而非硬沙盒
- Cloud Agent：沙盒隔离（microVM/gVisor/Docker）、状态持久化、连接管理——本质是 Linux 内核问题
- 环境信息收集策略：便宜的提前收集（OS/Shell/cwd），昂贵的按需探测（让模型自己试）
- **选择 Local Agent 作为主线**，下一课设计工具集（通用场景 + 垂类场景对比）

### L03: 工具集设计 — 通用场景 vs 垂类场景

**目标**：在写代码前先设计好工具集——通用 agent 和垂类 agent 分别需要什么工具

**反直觉的常识**：通用场景需要的工具反而更少。

**通用工具集**（基础设施级）：
- **Bash** — 万能工具，白名单/黑名单可配置，高危命令默认拦截，用户拒绝要明确告知模型
- **File Read** — offset + limit 精确读取，硬性截断上限，带行号输出
- **File Edit** — old_string → new_string 替换（非行号定位，因为行号会 stale），返回成功/失败+诊断信息
- **Todo List** — 任务分解和进度追踪

**垂类工具集**（业务级，以翻译 agent 为例）：
- **Translate** — 原子翻译（source_text + source/target_lang）
- **Progress Tracker** — 持久化翻译进度，断点续译
- **Style Guide** — 术语表和风格一致性
- **Todo List** — 共享

**关键讨论**：
- Write 和 Edit 是两个不同的工具（整文件覆盖 vs 精确替换）
- 工具返回值：成功时简短确认 + 失败时诊断信息（不返回 before/after diff，节省上下文）
- 通用工具是基础设施级的（不关心任务），垂类工具是业务级的（只为特定场景服务）
- Glob/Grep 可以先不拆——Bash 能覆盖，后面按需拆出

### L04: 代码走读 — 一次请求的完整生命周期

**目标**：按请求时序走读全部 1,252 行代码

**10 步时序**：启动 → 用户输入 → 压缩检查 → 调 API (SSE stream) → 收集响应 (text + tool_calls) → 追加历史 → 分支判断 (stop/tool_calls) → 权限检查 → 工具执行 → 结果回传 → 循环

**关键发现**：
- messages 列表是唯一核心状态——所有操作都是对它的 append 或替换
- 内层 while 循环是 agent 心脏：工具 → 结果 → 再工具 → stop
- 我们和 Claude Code 的循环结构几乎一样，差异在丰富程度
- 我们是 Claude Code (512K 行) 的 0.24%

## 技术栈

- Python 3.11+
- httpx（raw HTTP，不用 SDK）
- rich（终端美化）

## 快速开始

```bash
cd real-agent-101
python -m venv .venv
source .venv/bin/activate
pip install httpx rich python-dotenv

# 设置 API Key
export OPENAI_API_KEY="your-key"

# 运行
python -m src.main
```

## 前置知识

这个项目的作者在开始前已完成：
- [learn-real-claude-code](https://github.com/674019130/learn-real-claude-code) — 逆向分析 Claude Code 512K 行源码
- Claude Agent SDK 21 个 Python 示例实现

理论已经学过了，这个项目是亲手构建。
