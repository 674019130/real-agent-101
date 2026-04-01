# Real Agent 101

从零构建一个类 Claude Code 的 CLI Agent。不用 SDK，从 raw API 开始，逐课搭建。

## 这是什么

一个教学项目。通过对话式课程，一节一节地从零实现一个能用的 coding agent。每节课有一个具体目标，构建一部分功能，讨论设计决策，并对比 Claude Code 的生产实现。

**最终目标**：一个能读写文件、执行命令、搜索代码、管理上下文、控制权限的 CLI Agent。

## 阶段里程碑

| Phase | 目标 | 状态 |
|-------|------|------|
| 1 | **能对话** — API 调用、流式输出、多轮对话 | ✅ |
| 2 | **有手有眼** — 工具系统（Bash、文件读写、搜索） | |
| 3 | **有脑子** — System prompt 工程、上下文压缩 | |
| 4 | **可信赖** — 权限、持久化、子 agent、hooks | |
| 5 | **能干活** — 真实项目实战 + gap analysis | |

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
