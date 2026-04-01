export interface Question {
  id: string;
  question: string;
  answer: string;
  hint?: string;
}

export interface ContentItem {
  text: string;
  key?: boolean;
  code?: string;
}

export interface ContentSection {
  type: "student" | "teacher" | "output" | "comparison" | "insight" | "code";
  title: string;
  items: ContentItem[];
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

// Helper to create items quickly
const t = (text: string, key = false, code?: string): ContentItem => ({ text, key, code });

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
    objective: "搭建 agent 骨架 — while 循环 + raw API 调用 + 流式输出 + 消息历史累积",
    sections: [
      {
        type: "student",
        title: "学员设计的 Agent Loop 流程",
        items: [
          t("设计了 while True 循环流程（6 步）：读输入 → 构建消息列表 → 调 API → 流式输出 → 追加 assistant 回复到历史 → 循环"),
          t("messages 是一个 list[dict]，整个 agent 的核心状态都围绕这个列表", true),
          t("每轮循环：用户输入 append 进去，assistant 回复 append 进去，工具结果 append 进去"),
        ],
      },
      {
        type: "student",
        title: "学员定义的 Tool 接口",
        items: [
          t("name — 工具标识符，模型用来调用"),
          t("description — 工具描述（给模型看的，不是给人看的）"),
          t("input_schema — JSON Schema，定义参数格式（学员遗漏，老师补充）", true),
          t("is_concurrent_safe — 是否可以并行执行（只读工具=True）"),
          t("execute() — 核心业务逻辑，async 异步执行"),
          t("render() — 格式化工具输出给用户看"),
        ],
      },
      {
        type: "code",
        title: "源码：Tool 基类 (types.py)",
        items: [
          t("", false, `class Tool(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @property
    @abstractmethod
    def input_schema(self) -> dict:
        """JSON Schema for tool parameters."""
        ...

    @property
    def is_concurrent_safe(self) -> bool:
        """Read-only tools can run concurrently."""
        return False

    @abstractmethod
    async def execute(self, **params) -> str: ...

    def to_api_schema(self) -> dict:
        """Convert to OpenAI API format:
        {"type": "function", "function": {...}}"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_schema,
            },
        }`),
        ],
      },
      {
        type: "student",
        title: "学员设计的压缩策略",
        items: [
          t("80% 上下文触发 — 当 token 估算超过 128K × 0.8 = 102,400 时压缩"),
          t("粗暴整体压缩 — 把整个 messages 列表 dump 成文本 → 让模型总结 → 塞回 2 条消息"),
          t("压缩输出不需要保持原消息结构 — 纯文本摘要即可", true),
        ],
      },
      {
        type: "code",
        title: "源码：SSE 流式解析 (api.py)",
        items: [
          t("httpx 直接调 OpenAI API，手写 SSE 解析。核心是 buffer + split — 网络 chunk 不保证按行对齐。", false),
          t("", false, `async with client.stream("POST", API_URL, json=payload,
                         headers=headers, timeout=120.0) as resp:
    resp.raise_for_status()
    buffer = ""
    async for chunk in resp.aiter_text():
        buffer += chunk
        while "\\n" in buffer:
            line, buffer = buffer.split("\\n", 1)
            line = line.strip()
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]":
                    return  # 流结束信号
                event = json.loads(data_str)
                yield event  # AsyncGenerator yield`),
          t("data: [DONE] 是 SSE 的结束信号，不是 JSON", true),
        ],
      },
      {
        type: "teacher",
        title: "老师补充的 6 个要点",
        items: [
          t("消息历史累积 — assistant 回复必须 append 回 messages，否则每轮对话都是全新的，没有上下文", true),
          t("finish_reason 是 agent loop 的控制信号 — stop（说完了）、tool_calls（想用工具）、length（被截断）", true),
          t("system prompt 的位置 — OpenAI 放在 messages 数组第一条 {role: 'system'}；Anthropic 是独立参数 {system: '...'}"),
          t("压缩时机 — 在「发 API 前」检查，不是「工具调用后」。因为不管用户消息还是工具结果，都是 append 后再发 API，检查点守在发送前就够了"),
          t("input_schema — 学员遗漏了工具接口最关键的字段。这是 JSON Schema，告诉模型工具接受什么参数，没有它模型不知道怎么调"),
          t("压缩输出 — 模型输出纯文本摘要，你把它塞进固定的 2 条消息（user + assistant），不需要模型输出 JSON"),
        ],
      },
      {
        type: "code",
        title: "源码：Agent Loop 核心结构 (main.py)",
        items: [
          t("外层 while 等用户输入，内层 while 跑工具链直到 stop", false),
          t("", false, `async def agent_loop():
    messages: list[dict] = []   # 唯一核心状态
    registry = build_registry() # 注册 5 个工具

    while True:  # ← 外层循环：每轮用户输入
        user_input = console.input("You: ")
        messages.append({"role": "user", "content": user_input})

        while True:  # ← 内层循环：工具可能多轮
            # 压缩检查（发 API 前的唯一检查点）
            if needs_compaction(messages, config):
                messages = await compact_messages(...)

            # 调 API (streaming)
            async for chunk in stream_response(...):
                # 收集 text + tool_calls + finish_reason

            messages.append(assistant_msg)

            if finish_reason == "tool_calls":
                # 权限检查 → 执行工具 → 结果回传
                for tc in tool_calls:
                    result = await registry.dispatch(...)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": result
                    })
                continue  # 内层循环继续

            break  # finish_reason == "stop" → 等用户`),
        ],
      },
      {
        type: "output",
        title: "代码产出（5 个文件）",
        items: [
          t("main.py (244 行) — CLI 入口 + agent loop + 权限检查"),
          t("api.py (95 行) — raw httpx 调 OpenAI API，SSE 流式 + 非流式"),
          t("types.py (98 行) — Tool 基类 + CompactConfig + Message"),
          t("tools/registry.py (39 行) — 工具注册表 + dispatch（O(1) 查找）"),
          t("context/compact.py (89 行) — 上下文压缩（粗暴版：字符数/4 估算 token）"),
        ],
      },
      {
        type: "comparison",
        title: "对比 Claude Code 生产实现",
        items: [
          t("Agent loop → query.ts：同样是 while(true) + stop_reason 分支，但多了 cost tracking、error recovery（11 步）、hook 触发、subagent 协调"),
          t("压缩 → services/compact/（11 个文件，7 层策略）：snip → micro-compact → collapse → summarize...我们只有最粗暴的一层"),
          t("Tool 接口 → Tool.ts：我们的 Tool(ABC) 是同样的抽象，但 Claude Code 每个工具有独立的 prompt.ts 文件"),
          t("SSE 解析 → 用 SDK 封装了，我们手写是为了理解底层协议"),
        ],
      },
    ],
    questions: [
      {
        id: "l01-q1",
        question: "为什么 agent loop 用 while(True) 而不用递归？",
        answer: "栈深度安全、显式 break 条件更易推理、200+ 轮对话不会栈溢出。Claude Code 的 query.ts 也是 while(true)。递归的问题是每次递归都会在调用栈上增加一层，Python 默认 1000 层上限。",
        hint: "想想如果 agent 需要连续调用 200 次工具会发生什么",
      },
      {
        id: "l01-q2",
        question: "压缩后的消息列表为什么只需要 2 条消息？",
        answer: "API 只关心 messages 是合法的 user/assistant 交替序列。模型输出纯文本摘要，你把它塞进固定结构（user: 摘要, assistant: 确认）就行，不需要保持原始消息格式。关键是信息不丢，格式不重要。",
        hint: "OpenAI API 对 messages 结构有什么要求？",
      },
      {
        id: "l01-q3",
        question: "什么时候 chatbot 变成 agent？",
        answer: "当 finish_reason==\"tool_calls\" 分支接上的那一刻。模型说「我想用工具」，你执行了，把结果喂回去让它继续。这个循环一旦接上，chatbot 就变成 agent——它不再只是输出文本，而是能采取行动了。",
        hint: "区别在于模型能不能「做事」",
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
          t("环境决定工具集，工具集决定能力边界", true),
          t("开发之前必须想清楚 agent 解决什么问题、跑在什么环境"),
        ],
      },
      {
        type: "student",
        title: "三种 Agent 运行环境",
        items: [
          t("Local Agent（客户端）— 直接访问本地文件系统、进程、网络。代表：Claude Code, Cursor, Aider"),
          t("Cloud-hosted Agent（云端）— 运行在远程沙盒，需要隔离、持久化、连接管理。代表：Manus, Devin, Codex"),
          t("Hybrid Agent（混合）— 控制面在云端，通过 tunnel/SSH 操作本地。代表：Claude Code Remote 模式"),
        ],
      },
      {
        type: "student",
        title: "Local Agent 的核心特征",
        items: [
          t("直接访问本地文件系统、进程、网络——不需要 API 中转"),
          t("Bash 是万能工具——模型试错、自我修正，大部分任务一个 bash 就能覆盖", true),
          t("不需要硬沙盒（用户自己的机器），但需要权限系统作为软沙盒"),
          t("启动时收集环境信息注入 system prompt（OS/Shell/cwd/git 状态）"),
        ],
      },
      {
        type: "student",
        title: "Cloud Agent 的难点",
        items: [
          t("沙盒隔离 — Firecracker microVM / gVisor / Docker，本质是 Linux namespace + cgroup + overlay filesystem"),
          t("状态持久化 — 文件系统快照、session 恢复"),
          t("连接管理 — WebSocket 长连接 × 数万用户"),
          t("资源调度 — Pod 创建/回收/扩缩容"),
        ],
      },
      {
        type: "teacher",
        title: "老师补充",
        items: [
          t("术语修正 — 学员说的「客户端/云端」，业界叫 Local Agent / Cloud-hosted Agent / Hybrid Agent"),
          t("第四种模式：Headless Agent — 本地运行但无人值守（Claude Code --headless、KAIROS daemon），对 CI/CD 集成很重要"),
          t("环境信息收集策略：便宜的提前收集（OS/Shell/cwd），昂贵的按需探测（哪些 CLI 可用）", true),
          t("macOS vs Linux 命令差异（sed -i '' vs sed -i）、Shell 语法差异（fish vs bash/zsh）——提前知道能省很多轮试错"),
          t("Local Agent 也需要安全边界 — 权限模式（ask/auto/yolo）、破坏性命令检测、路径白名单。这是 Phase 5 的内容"),
        ],
      },
      {
        type: "insight",
        title: "学员的最终判断",
        items: [
          t("Local Agent 更具教学意义——涉及知识点更多", true),
          t("Cloud Agent 的沙盒问题更偏 Linux 内核，是独立主题"),
          t("主线选择：Local Agent，通用，交互式 CLI"),
        ],
      },
    ],
    questions: [
      {
        id: "l02-q1",
        question: "Local Agent 和 Cloud Agent 最本质的区别是什么？",
        answer: "信任边界不同。Local Agent 信任用户（用户的机器），用权限系统做软约束。Cloud Agent 不信任代码（多租户环境），用硬沙盒（microVM/container）做强隔离。一个是「你的电脑你做主」，一个是「我要保护所有租户」。",
        hint: "想想「谁」在运行这个 agent",
      },
      {
        id: "l02-q2",
        question: "为什么不在启动时收集所有可用的 CLI 工具信息？",
        answer: "成本不对等。扫描所有 CLI 工具需要时间（可能几百个命令），且大部分信息用不到。策略是：便宜的信息（OS/Shell/cwd）一次性收集零成本，昂贵的信息让模型用 bash 按需探测——试错成本更低，按需获取更高效。",
        hint: "想想收集 vs 按需探测的成本对比",
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
          t("反直觉：通用场景需要的工具反而更少——因为有 Bash 兜底", true),
        ],
      },
      {
        type: "student",
        title: "通用工具集（5 个真实实现）",
        items: [
          t("Bash — 万能工具，白名单/黑名单可配置，高危命令（rm -rf /、sudo、chmod 777）默认拦截，30 秒超时，50K 字符截断"),
          t("File Read — file_path + offset + limit，硬性 500 行上限，带行号输出。即使模型不传 limit 也强制截断", true),
          t("File Edit — old_string → new_string 精确替换。必须唯一匹配，0 次匹配返回「没找到」，多次匹配返回「请更精确」"),
          t("File Write — 整文件覆盖/创建新文件，自动创建父目录。和 Edit 是两个不同的工具"),
          t("Todo List — add/update/list，JSON 文件持久化，状态：pending/in_progress/done/cancelled"),
        ],
      },
      {
        type: "code",
        title: "源码：Bash 工具的安全层 (bash.py)",
        items: [
          t("两层检查：硬黑名单（直接拦截）+ 危险模式（需要用户确认）", false),
          t("", false, `# 硬黑名单：这些命令永远不执行
DEFAULT_BLACKLIST = [
    "rm -rf /", "rm -rf /*",
    "mkfs", "dd if=",
    ":(){:|:&};:",  # fork bomb
]

# 危险但有时需要：弹确认
DANGEROUS_PATTERNS = [
    "sudo ", "chmod 777", "rm -rf",
    "git push --force", "git reset --hard",
    "shutdown", "reboot", "kill -9",
]

MAX_OUTPUT_CHARS = 50_000  # ~12,500 tokens

async def execute(self, command: str = "", **_) -> str:
    blocked = self._check_blacklist(command)
    if blocked:
        return blocked  # "BLOCKED: ..."

    proc = await asyncio.create_subprocess_shell(
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(), timeout=30.0  # 30 秒超时
    )`),
        ],
      },
      {
        type: "code",
        title: "源码：File Edit 的唯一性检查 (edit.py)",
        items: [
          t("old_string 必须在文件中恰好出现一次。0 次 → 告诉模型「重新读文件」；多次 → 告诉模型「提供更多上下文」", false),
          t("", false, `count = content.count(old_string)

if count == 0:
    return (
        f"Error: old_string not found in '{path}'. "
        f"Re-read the file to get current content.\\n"
        f"File preview (first 500 chars):\\n{preview}"
    )  # ← actionable error

if count > 1:
    return (
        f"Error: old_string found {count} times. "
        f"Include more surrounding context to uniquely identify."
    )  # ← 告诉模型怎么修

# 恰好一次 → 替换
new_content = content.replace(old_string, new_string, 1)`),
        ],
      },
      {
        type: "student",
        title: "垂类工具集（翻译 Agent，伪代码）",
        items: [
          t("Translate — 原子翻译，输入 source_text + source_lang + target_lang"),
          t("Progress Tracker — 持久化翻译进度，启动时恢复状态，支持断点续译"),
          t("Style Guide — 术语表（agent→智能体）和风格偏好（正式/第三人称），模型读取后保持一致"),
          t("Todo List — 与通用共享"),
        ],
      },
      {
        type: "teacher",
        title: "工具设计的 6 条工程经验",
        items: [
          t("Description 就是 prompt — 工具描述是给模型看的。Claude Code 每个工具有独立 prompt.ts，写明何时该用、何时不该用、常见错误用法", true),
          t("错误信息要 actionable — 不返回 \"Error\"，要返回 \"Error: file not found. Use glob to search.\" 模型才能自我修正", true),
          t("结果截断要声明 — [truncated: showing 100 of 5,832 lines]，否则模型以为看到了完整内容"),
          t("JSON Schema 约束比描述更强 — enum、maxLength、minimum 这些，模型遵守得比自然语言描述好"),
          t("幂等性 — old_string→new_string 天然幂等（第二次匹配不到就报错）。Bash 不幂等（echo >> file 重试会追加两次）"),
          t("结果预算 — 每个工具应有最大结果大小（Bash: 50K chars, Read: 500 lines），防止吃掉整个上下文窗口"),
        ],
      },
      {
        type: "insight",
        title: "设计主旨",
        items: [
          t("通用工具是「基础设施级」— 文件系统、进程，不关心你在做什么任务", true),
          t("垂类工具是「业务级」— 翻译、进度、风格，只为特定任务存在"),
          t("工具足够原子化，实现唯一功能，稳定，语义清晰"),
        ],
      },
    ],
    questions: [
      {
        id: "l03-q1",
        question: "为什么 File Edit 用字符串匹配而不用行号定位？",
        answer: "行号在多次编辑后会 stale（过时）。比如在第 1 行后插入一行，原来第 3 行的 print(\"world\") 变成了第 4 行，但模型记忆里还是「第 3 行」。字符串内容不会因为其他编辑而变化，所以 old_string→new_string 更鲁棒。",
        hint: "想想连续编辑两次会发生什么",
      },
      {
        id: "l03-q2",
        question: "通用工具和垂类工具的本质区别是什么？",
        answer: "抽象层级不同。通用工具是「基础设施级」（文件系统、进程）——不关心你在做翻译还是写代码。垂类工具是「业务级」（翻译、进度、风格）——只为特定任务存在。前者像操作系统的系统调用，后者像应用层的 API。",
        hint: "类比操作系统 vs 应用程序",
      },
      {
        id: "l03-q3",
        question: "为什么工具返回错误时不能只返回 \"Error\"？",
        answer: "模型需要「可行动的」（actionable）信息才能自我修正。\"Error: file not found at /foo/bar.py. Use glob to search for the correct path.\" 比 \"Error\" 好 10 倍——它告诉模型发生了什么、下一步该怎么做。Claude Code 的 Edit 工具在匹配失败时会返回 found 0/N matches 和修正建议。",
        hint: "如果你是模型，看到 \"Error\" 你能做什么？",
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
          t("我们的 1,252 行 = Claude Code 512K 行的 0.24%", true),
          t("但循环骨架几乎一样——差异全在循环体内的丰富度"),
        ],
      },
      {
        type: "code",
        title: "项目文件结构",
        items: [
          t("", false, `real-agent-101/  (1,252 行)
├── main.py      244 行  入口 + agent loop + 权限
├── api.py        95 行  raw HTTP (流式 + 非流式)
├── types.py      98 行  Tool 基类 + CompactConfig
├── tools/
│   ├── registry.py   39 行  注册表 + dispatch
│   ├── bash.py      128 行  Bash (黑名单/超时/截断)
│   ├── read.py      103 行  读文件 (行号/offset/limit)
│   ├── edit.py       95 行  编辑 (old→new 唯一匹配)
│   ├── write.py      63 行  写文件 (全文覆盖)
│   └── todo.py      143 行  Todo (持久化 JSON)
└── context/
    └── compact.py    89 行  压缩 (80%阈值/整体压缩)`),
        ],
      },
      {
        type: "student",
        title: "10 步请求时序",
        items: [
          t("Step 0 启动 (main.py:232) — init_store() 初始化 Todo 持久化 → build_registry() 注册 5 个工具 → asyncio.run()"),
          t("Step 1 用户输入 (main.py:92) — console.input() 阻塞等键盘 → append 到 messages 列表"),
          t("Step 2 压缩检查 (main.py:112) — estimate_tokens() 用「总字符数 / 4」估算 → 超 102,400 就触发压缩"),
          t("Step 3 调 API (api.py:27) — system prompt 拼到 messages 最前面 → httpx stream POST → SSE buffer+split 解析 → yield chunks"),
          t("Step 4 收集响应 (main.py:131-162) — 三路收集：delta.content（文本）/ delta.tool_calls（分块拼接）/ finish_reason", true),
          t("Step 5 追加历史 (main.py:172) — assistant msg append 到 messages，有 tool_calls 时 content 可为 None"),
          t("Step 6 分支判断 (main.py:178) — finish_reason==\"tool_calls\" → 进工具流程；\"stop\" → 等用户", true),
          t("Step 7 权限检查 (main.py:187) — is_concurrent_safe==True 免确认 / 写操作+危险 bash 要用户 y/n / 拒绝返回 REJECTED"),
          t("Step 8 执行工具 (main.py:212) — registry.dispatch() → tool.execute(**params) → 返回结果字符串"),
          t("Step 9 结果回传 (main.py:219) — tool_call_id 关联（必须匹配，否则 API 报错）→ append tool msg"),
          t("Step 10 循环 (main.py:226) — continue → 回 Step 2，模型看到工具结果后继续调工具或给出最终回答"),
        ],
      },
      {
        type: "code",
        title: "源码：tool_calls 的分块到达和拼接",
        items: [
          t("OpenAI 的 tool_calls 参数是流式分块到达的 JSON 字符串。先来 {\"com，再来 mand\": \"ls\"}，必须拼完再 json.loads()。", true),
          t("", false, `# 收集 tool_calls（streamed incrementally）
if delta.get("tool_calls"):
    for tc in delta["tool_calls"]:
        idx = tc["index"]
        # Grow the list if needed
        while len(tool_calls) <= idx:
            tool_calls.append({
                "id": "",
                "type": "function",
                "function": {"name": "", "arguments": ""},
            })
        if tc.get("id"):
            tool_calls[idx]["id"] = tc["id"]
        if tc.get("function", {}).get("name"):
            tool_calls[idx]["function"]["name"] = tc["function"]["name"]
        if tc.get("function", {}).get("arguments"):
            # arguments 是分块到达的 JSON 字符串，必须累积拼接
            tool_calls[idx]["function"]["arguments"] += \\
                tc["function"]["arguments"]`),
        ],
      },
      {
        type: "code",
        title: "源码：权限检查 + 用户拒绝处理",
        items: [
          t("REJECTED 消息是关键——不是静默跳过，而是明确告诉模型被拒绝了", true),
          t("", false, `# 权限判断
tool = registry.get(func_name)
needs_permission = True

# 只读工具免确认
if tool and tool.is_concurrent_safe:
    needs_permission = False

# 危险 bash 命令强制确认
if func_name == "bash" and tool.is_dangerous(command):
    needs_permission = True

if needs_permission:
    approved = ask_permission(func_name, func_args)
    if not approved:
        messages.append({
            "role": "tool",
            "tool_call_id": tc["id"],
            "content": "REJECTED: User denied execution. "
                       "Do not retry. Ask user what to do."
        })`),
        ],
      },
      {
        type: "teacher",
        title: "关键发现",
        items: [
          t("messages 列表是唯一核心状态 — 所有操作（输入、回复、工具结果、压缩）都是对它的 append 或替换", true),
          t("tool_calls 的 arguments 是分块 JSON — 先来 {\"com，再来 mand\": \"ls\"}，必须拼完再 json.loads()"),
          t("内层 while 循环是 agent 的心脏 — 工具 → 结果 → 再工具 → 直到 stop", true),
          t("我们和 Claude Code 的循环结构几乎一样 — 差异在循环体内的丰富度：压缩层数、权限策略、error recovery、流式执行"),
        ],
      },
      {
        type: "comparison",
        title: "逐步对比 Claude Code",
        items: [
          t("启动 — CC 有 fast path（--version 5ms 退出），我们全量加载"),
          t("消息管理 — CC 有独立 Message 类型系统（不是裸 dict），有类型安全"),
          t("压缩 — CC 有 7 层策略（snip/micro/collapse/summarize...），我们只有 1 层"),
          t("流式执行 — CC 的 StreamingToolExecutor 边收边执行（mid-stream），我们等收完再执行"),
          t("权限 — CC 有 24 个文件，permission racing（hook + AI 分类器 + 用户确认 并发跑）"),
        ],
      },
    ],
    questions: [
      {
        id: "l04-q1",
        question: "为什么需要内层和外层两个 while 循环？",
        answer: "外层等用户输入（人类节奏），内层跑工具链（机器节奏）。模型可能连续调用 5 个工具才完成一个任务——读文件、编辑、再读、运行测试、报告结果。内层循环让它持续执行直到 stop，不需要人类介入。如果只有一个循环，每次工具执行后都要等用户输入，agent 就废了。",
        hint: "想想模型需要连续调用多个工具的场景",
      },
      {
        id: "l04-q2",
        question: "tool_calls 的 arguments 为什么是分块到达的？",
        answer: "SSE 流式传输的本质——服务器边生成边发，不等 JSON 完整就开始传输。一个 {\"command\": \"ls -la\"} 可能被切成 3 个 chunk。你必须用一个 buffer 累积拼接，等流结束后才能 json.loads()。Claude Code 的 StreamingToolExecutor 在 content_block_stop 事件（一个完整的 tool_call 结束）时才触发执行。",
        hint: "SSE 是流式协议，数据不会等 JSON 写完才发",
      },
    ],
  },
];

export function getLessonById(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}
