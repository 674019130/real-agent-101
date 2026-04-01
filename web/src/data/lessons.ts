export interface Question {
  id: string;
  question: string;
  answer: string;
}

export interface ContentSection {
  type: "student" | "teacher" | "output" | "comparison" | "insight";
  title: string;
  items: string[];
}

export interface Lesson {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  phase: string;
  phaseNumber: number;
  color: string;
  colorClass: string;
  objective: string;
  sections: ContentSection[];
  questions: Question[];
}

export interface Phase {
  number: number;
  title: string;
  status: "done" | "active" | "upcoming";
}

export const phases: Phase[] = [
  { number: 1, title: "能对话 — Agent loop、流式 API、消息历史", status: "done" },
  { number: 2, title: "定方向 — Agent 类型、运行环境、工具集设计", status: "active" },
  { number: 3, title: "有手有眼 — 实现工具系统", status: "upcoming" },
  { number: 4, title: "有脑子 — System prompt、上下文管理", status: "upcoming" },
  { number: 5, title: "可信赖 — 权限、持久化、子 agent、hooks", status: "upcoming" },
  { number: 6, title: "能干活 — 真实项目实战 + gap analysis", status: "upcoming" },
];

export const lessons: Lesson[] = [
  {
    id: "l01",
    number: 1,
    title: "Agent 的雏形",
    subtitle: "一个会聊天的 while 循环",
    phase: "能对话",
    phaseNumber: 1,
    color: "#3B82F6",
    colorClass: "text-blue",
    objective:
      "搭建 agent 骨架 — while 循环 + raw API 调用 + 流式输出 + 消息历史累积",
    sections: [
      {
        type: "student",
        title: "学员设计",
        items: [
          "设计了 while True 循环流程：读输入 → 构建消息 → 调 API → 流式输出 → 追加历史 → 循环",
          "定义了 Tool 接口：name / description / is_concurrent_safe / execute() / render()",
          "设计了压缩策略：80% 上下文触发，整体压缩为 2 条消息",
        ],
      },
      {
        type: "teacher",
        title: "老师补充",
        items: [
          "消息历史累积 — assistant 回复要 append 回 messages，不然每轮是全新对话",
          "finish_reason 是 agent loop 的控制信号 — stop / tool_calls / length",
          "system prompt 位置 — OpenAI 是 messages 第一条，Anthropic 是独立参数",
          "压缩时机 — 发 API 前检查，不是工具调用后",
          "input_schema — 学员遗漏的工具接口最关键字段，JSON Schema 告诉模型参数格式",
          "压缩输出不需要保持原消息结构 — 纯文本摘要塞进固定 2 条消息",
        ],
      },
      {
        type: "output",
        title: "代码产出",
        items: [
          "main.py — CLI 入口 + agent loop",
          "api.py — raw httpx 调 OpenAI API（SSE 流式）",
          "types.py — Tool 基类 + CompactConfig",
          "tools/registry.py — 工具注册表 + dispatch",
          "context/compact.py — 上下文压缩（粗暴版）",
        ],
      },
      {
        type: "comparison",
        title: "对比 Claude Code",
        items: [
          "Agent loop → query.ts：同样是 while(true) + stop_reason 分支",
          "压缩 → services/compact/（11 个文件）：我们用 1 个文件的粗暴版",
          "Tool 接口 → Tool.ts：我们的 Tool(ABC) 是同样的抽象",
        ],
      },
    ],
    questions: [
      {
        id: "l01-q1",
        question: "为什么 agent loop 用 while(True) 而不用递归？",
        answer:
          "栈深度安全、显式 break 条件更易推理、200+ 轮对话不会栈溢出。Claude Code 的 query.ts 也是 while(true)。",
      },
      {
        id: "l01-q2",
        question: "压缩后的消息列表为什么只需要 2 条消息？",
        answer:
          "API 只关心 messages 是合法的 user/assistant 交替。模型输出纯文本摘要，你把它塞进固定结构就行，不需要保持原始消息格式。",
      },
      {
        id: "l01-q3",
        question: "什么时候 chatbot 变成 agent？",
        answer:
          '当 finish_reason=="tool_calls" 分支接上的那一刻——模型说想用工具，你执行了，结果喂回去让它继续。',
      },
    ],
  },
  {
    id: "l02",
    number: 2,
    title: "Agent 跑在哪",
    subtitle: "运行环境决定能力边界",
    phase: "定方向",
    phaseNumber: 2,
    color: "#10B981",
    colorClass: "text-green",
    objective: "在写工具之前，先想清楚 agent 是什么类型、跑在什么环境",
    sections: [
      {
        type: "insight",
        title: "核心观点",
        items: [
          "环境决定工具集，工具集决定能力边界",
        ],
      },
      {
        type: "student",
        title: "学员分析",
        items: [
          "提出两种环境：客户端（直接访问本地资源）vs 云端（需要沙盒隔离）",
          "客户端 Agent：Bash 是万能工具，模型试错自我修正",
          "云端 Agent：沙盒隔离、状态持久化、连接管理、资源调度",
          "判断：Local Agent 更具教学意义，选择为主线",
        ],
      },
      {
        type: "teacher",
        title: "老师补充",
        items: [
          "术语修正 — Local Agent / Cloud-hosted Agent / Hybrid Agent",
          "第四种模式：Headless Agent — 本地运行但无人值守（CI/CD 集成）",
          "环境信息收集策略 — 便宜的提前收集（OS/Shell/cwd），昂贵的按需探测",
          "Local Agent 也需要权限系统作为软沙盒 — ask / auto / yolo 模式",
        ],
      },
    ],
    questions: [
      {
        id: "l02-q1",
        question: "Local Agent 和 Cloud Agent 最本质的区别是什么？",
        answer:
          "信任边界不同。Local Agent 信任用户（用户的机器），用权限系统做软约束。Cloud Agent 不信任代码（多租户），用硬沙盒（microVM/container）做隔离。",
      },
      {
        id: "l02-q2",
        question: "为什么不在启动时收集所有可用的 CLI 工具信息？",
        answer:
          "成本不对等。扫描所有 CLI 工具需要时间且大部分信息用不到。便宜的信息（OS/Shell/cwd）提前收集，昂贵的让模型用 bash 按需探测，试错成本更低。",
      },
    ],
  },
  {
    id: "l03",
    number: 3,
    title: "工具集设计",
    subtitle: "通用场景 vs 垂类场景",
    phase: "定方向",
    phaseNumber: 2,
    color: "#8B5CF6",
    colorClass: "text-purple",
    objective: "设计通用 agent 和垂类 agent 分别需要什么工具",
    sections: [
      {
        type: "insight",
        title: "核心洞察",
        items: [
          "反直觉：通用场景需要的工具反而更少",
        ],
      },
      {
        type: "student",
        title: "学员设计 — 通用工具集",
        items: [
          "Bash — 万能工具，白名单/黑名单可配置，高危命令默认拦截",
          "File Read — offset + limit 精确读取，硬性截断上限，带行号输出",
          "File Edit — old_string → new_string 替换，权限确认，诊断信息返回",
          "Todo List — 任务分解和进度追踪，JSON 持久化",
        ],
      },
      {
        type: "student",
        title: "学员设计 — 垂类工具集（翻译 Agent）",
        items: [
          "Translate — 原子翻译（source_text + lang）",
          "Progress Tracker — 持久化翻译进度，断点续译",
          "Style Guide — 术语表和风格一致性",
          "Todo List — 与通用共享",
        ],
      },
      {
        type: "teacher",
        title: "老师补充",
        items: [
          "Write 和 Edit 是两个工具 — 学员最初混在一起了",
          "Edit 用 old_string→new_string 不用行号 — 行号在多次编辑后会 stale",
          "Description 就是 prompt — 工具描述是给模型看的，要写明何时该用、何时不该用",
          "错误信息要 actionable — 不返回 Error，要返回具体的修正建议",
          "JSON Schema 约束比自然语言描述更强 — enum / maxLength / minimum",
          "Glob/Grep 可以先不拆 — Bash 能覆盖，后面按需拆出",
        ],
      },
      {
        type: "insight",
        title: "设计主旨",
        items: [
          "通用工具是「基础设施级」— 不关心你在做什么任务",
          "垂类工具是「业务级」— 只为特定任务存在",
          "工具足够原子化，实现唯一功能，稳定，语义清晰",
        ],
      },
    ],
    questions: [
      {
        id: "l03-q1",
        question: "为什么 File Edit 用字符串匹配而不用行号定位？",
        answer:
          "行号在多次编辑后会 stale（过时）。插入一行后所有后续行号都变了，但字符串内容不变，所以 old_string→new_string 更鲁棒。",
      },
      {
        id: "l03-q2",
        question: "通用工具和垂类工具的本质区别是什么？",
        answer:
          '通用工具是"基础设施级"（文件系统、进程）——不关心你在做什么任务。垂类工具是"业务级"（翻译、进度、风格）——只为特定任务存在。',
      },
      {
        id: "l03-q3",
        question: '为什么工具返回错误时不能只返回 "Error"？',
        answer:
          '模型需要可行动的（actionable）信息才能自我修正。"Error: file not found, use glob to search" 比 "Error" 好 10 倍。',
      },
    ],
  },
  {
    id: "l04",
    number: 4,
    title: "代码走读",
    subtitle: "一次请求的完整生命周期",
    phase: "定方向",
    phaseNumber: 2,
    color: "#F59E0B",
    colorClass: "text-amber",
    objective: "按请求时序走读全部 1,252 行代码，建立对 agent 开发的直觉",
    sections: [
      {
        type: "insight",
        title: "全景",
        items: [
          "我们的 1,252 行 = Claude Code 512K 行的 0.24%",
        ],
      },
      {
        type: "student",
        title: "10 步请求时序",
        items: [
          "Step 0 启动 — init todo → 注册 5 工具 → asyncio.run",
          "Step 1 用户输入 — 阻塞读键盘 → append 到 messages",
          "Step 2 压缩检查 — 字符数/4 估算 → 超 80% 就压缩",
          "Step 3 调 API — system 拼到 messages → httpx stream → SSE 解析",
          "Step 4 收集响应 — text 打印+累积 / tool_calls 拼接 / finish_reason",
          "Step 5 追加历史 — assistant msg → messages",
          "Step 6 分支判断 — tool_calls → 工具流程；stop → 等用户",
          "Step 7 权限检查 — 只读免确认 / 写操作要 y/n / 拒绝返回 REJECTED",
          "Step 8 执行工具 — dispatch → execute → 结果字符串",
          "Step 9 结果回传 — tool_call_id 关联 → append tool msg",
          "Step 10 循环 — continue → 回 Step 2",
        ],
      },
      {
        type: "teacher",
        title: "关键发现",
        items: [
          "messages 列表是唯一核心状态 — 所有操作都是对它的 append 或替换",
          "tool_calls 的 arguments 是分块 JSON — 必须拼完再 json.loads()",
          "内层 while 循环是 agent 的心脏 — 工具 → 结果 → 再工具 → stop",
          "循环结构和 Claude Code 几乎一样 — 差异在丰富程度",
        ],
      },
    ],
    questions: [
      {
        id: "l04-q1",
        question: "为什么需要内层和外层两个 while 循环？",
        answer:
          "外层等用户输入（人类节奏），内层跑工具链（机器节奏）。模型可能连续调用多个工具才完成一个任务，内层循环让它持续执行直到 stop，不需要人类介入。",
      },
      {
        id: "l04-q2",
        question: "tool_calls 的 arguments 为什么是分块到达的？",
        answer:
          "SSE 流式传输的本质——服务器边生成边发，JSON 被切成碎片。你必须累积拼接后才能 json.loads()。这也是为什么 Claude Code 的 StreamingToolExecutor 要在 content_block_stop 事件时才触发执行。",
      },
    ],
  },
];

export function getLessonById(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}
