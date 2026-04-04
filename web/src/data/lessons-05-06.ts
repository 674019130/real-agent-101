import { Lesson, ContentItem, CodeAnnotation } from "./lessons";

const t = (text: string, key = false, code?: string): ContentItem => ({ text, key, code });

export const lessons0506: Lesson[] = [
  {
    id: "l05",
    number: 5,
    title: "权限系统",
    subtitle: "三层权限 × 三种模式",
    phase: "可信赖",
    phaseNumber: 5,
    color: "#8B5CF6",
    colorClass: "text-purple",
    objective: "设计三层权限（AUTO/ASK/DENY）+ 三种模式（normal/auto/yolo）+ bypass-immune 机制",
    sections: [
      {
        type: "student",
        title: "三层权限设计",
        items: [
          t("AUTO — 自动执行，不需要用户确认。适用于只读操作、项目目录内的安全操作", true),
          t("ASK — 弹出 y/n 确认。适用于写操作、编辑文件、可能改变状态的命令"),
          t("DENY — 默认拒绝，只有用户明确要求才执行。适用于破坏性操作、越界访问、系统级修改", true),
          t("三层的核心逻辑：权限越高，自动化程度越低，人工介入越多"),
        ],
      },
      {
        type: "student",
        title: "三种运行模式",
        items: [
          t("NORMAL — 默认模式。AUTO 自动执行，ASK 弹确认，DENY 拒绝"),
          t("AUTO — 宽松模式。ASK 降级为 AUTO（自动执行），DENY 保持不变", true),
          t("YOLO — 最宽松。所有操作自动执行，除了 DENY → ASK（不是 AUTO！）", true),
          t("关键设计：即使 YOLO 模式，DENY 也只降到 ASK，永远不会变成 AUTO"),
        ],
      },
      {
        type: "table",
        title: "Permission Matrix: 工具声明 × 运行模式 → 最终结果",
        items: [],
        headers: ["工具声明", "NORMAL", "AUTO", "YOLO"],
        rows: [
          { cells: ["AUTO", "AUTO", "AUTO", "AUTO"] },
          { cells: ["ASK", "ASK", "AUTO", "AUTO"], highlight: true },
          { cells: ["DENY", "DENY", "DENY", "ASK"], highlight: true },
          { cells: ["bypass-immune", "ASK", "ASK", "ASK"], highlight: true },
        ],
        caption: "注意最后一行：bypass-immune 无视所有模式，永远 ASK",
      },
      {
        type: "code",
        title: "源码：check_permission 模式应用逻辑 (checker.py)",
        items: [
          t("中央决策点：接收工具声明的权限等级 + 全局模式，输出最终权限。不执行检查，只做决策。", false),
          { text: "", code: `def check_permission(
    tool_name: str,
    tool_level: PermissionLevel,
    mode: PermissionMode,
    bypass_immune: bool = False,
) -> PermissionLevel:
    """Apply global mode to the tool's declared permission level."""

    # bypass-immune 检查始终需要用户确认
    if bypass_immune:
        return PermissionLevel.ASK

    # 应用全局模式
    if mode == PermissionMode.YOLO:
        # YOLO 模式：全部 AUTO，但 DENY → ASK（不是 AUTO）
        if tool_level == PermissionLevel.DENY:
            return PermissionLevel.ASK
        return PermissionLevel.AUTO

    if mode == PermissionMode.AUTO:
        # AUTO 模式：ASK 变为 AUTO，DENY 保持不变
        if tool_level == PermissionLevel.ASK:
            return PermissionLevel.AUTO
        return tool_level

    # NORMAL 模式：原样透传
    return tool_level`, annotations: [
              { lines: [1, 7] as [number, number], label: "函数签名", explanation: "接收工具声明的权限等级、全局模式、bypass-immune 标记，输出最终权限等级。纯决策函数，不执行任何操作。" },
              { lines: [9, 11] as [number, number], label: "免疫检查", explanation: "bypass-immune 优先级最高 — 无论什么模式，直接返回 ASK。这是 .git/.env 等关键路径的保护机制。" },
              { lines: [14, 18] as [number, number], label: "YOLO 模式", explanation: "最宽松模式：所有操作变 AUTO，但 DENY 只降到 ASK（不是 AUTO）。这是安全底线 — 防止恶意 prompt 利用 YOLO 执行破坏性命令。" },
              { lines: [20, 24] as [number, number], label: "AUTO 模式", explanation: "中等宽松：ASK 降级为 AUTO（自动执行），DENY 保持不变。用户信任 agent 做日常操作，但危险操作仍需确认。" },
              { lines: [26, 27] as [number, number], label: "NORMAL 模式", explanation: "默认模式：原样透传工具声明的权限等级，不做任何降级。" },
            ] },
          t("4 行核心逻辑，3 个 if 分支，覆盖所有 9 种组合", true),
        ],
      },
      {
        type: "insight",
        title: "bypass-immune 的设计哲学",
        items: [
          t("bypass-immune 是独立于三层权限的额外标记 — 它不是第四个权限等级，而是一个布尔开关", true),
          t("DENY 可以被 mode 降级（yolo: DENY→ASK），但 bypass-immune 无法被任何 mode 覆盖"),
          t(".git/、.env、.ssh/、.gnupg/、.aws/、.kube/ — 这些路径是 bypass-immune 的，因为误操作后果不可逆", true),
          t("设计意图：即使用户选了 yolo 模式（表示信任 agent），也不能让 agent 在无确认的情况下碰这些关键路径"),
        ],
      },
      {
        type: "code",
        title: "源码：bypass-immune 路径检查 (path_check.py)",
        items: [
          t("两类保护：bypass-immune 模式（目录级）+ sensitive files（文件级）", false),
          { text: "", code: `# 始终拒绝的路径，即使 yolo 模式也不放行（bypass-immune）
BYPASS_IMMUNE_PATTERNS = [
    ".git/",          # git 内部文件
    ".env",           # 环境变量密钥
    ".ssh/",          # SSH 密钥
    ".gnupg/",        # GPG 密钥
    ".aws/",          # AWS 凭证
    ".kube/",         # Kubernetes 配置
]

# 项目内也会触发 DENY 的敏感文件
SENSITIVE_FILES = [
    ".env", ".env.local", ".env.production",
    "credentials.json", "secrets.yaml",
    "id_rsa", "id_ed25519",
]

def is_bypass_immune(file_path: str) -> bool:
    """Check if a path matches bypass-immune patterns.
    These are ALWAYS denied, even in yolo mode."""
    normalized = file_path.replace("\\\\", "/")
    for pattern in BYPASS_IMMUNE_PATTERNS:
        if pattern in normalized:
            return True
    return False`, annotations: [
              { lines: [1, 9] as [number, number], label: "免疫路径", explanation: "目录级保护列表 — 这些路径下的任何文件都触发 bypass-immune，即使 YOLO 模式也必须用户确认。都是泄露后果不可逆的凭证目录。" },
              { lines: [11, 16] as [number, number], label: "敏感文件", explanation: "文件级保护 — 项目内的敏感文件。与 bypass-immune 不同，这些触发 DENY 而非 bypass-immune，在 YOLO 模式下可降级为 ASK。" },
              { lines: [18, 25] as [number, number], label: "路径匹配", explanation: "简单的子串匹配检查。先统一路径分隔符为 /，然后逐个匹配 bypass-immune 模式。命中任意一个即返回 True。" },
            ] },
        ],
      },
      {
        type: "student",
        title: "Bash 工具的两层安全",
        items: [
          t("第一层：DEFAULT_BLACKLIST — 硬拦截，永远不执行，返回 BLOCKED 错误。rm -rf /、fork bomb、mkfs、dd if=", true),
          t("第二层：DANGEROUS_PATTERNS — 需要用户确认。sudo、chmod 777、rm -rf、git push --force、kill -9"),
          t("黑名单命令返回 DENY + bypass_immune=True（双保险：即使 yolo 也要确认）"),
          t("危险命令返回 DENY + bypass_immune=False（yolo 模式下降级为 ASK）"),
          t("普通命令返回 ASK + bypass_immune=False（bash 永远不是 AUTO，因为任何命令都可能改变状态）", true),
        ],
      },
      {
        type: "code",
        title: "源码：Bash 工具的权限声明 (bash.py)",
        items: [
          t("工具自己判断操作的危险等级，checker 只负责应用 mode — 职责分离", false),
          { text: "", code: `DEFAULT_BLACKLIST = [
    "rm -rf /", "rm -rf /*",
    "mkfs", "dd if=",
    ":(){:|:&};:",  # fork bomb（进程炸弹）
]

DANGEROUS_PATTERNS = [
    "sudo ", "chmod 777", "rm -rf",
    "rm -r /", "> /dev/sd",
    "shutdown", "reboot", "kill -9", "pkill",
    "git push --force", "git reset --hard",
]

def check_permission(self, command: str = "", **_) -> tuple[PermissionLevel, bool]:
    """Bash permission: blacklisted → DENY, dangerous → ASK, safe → ASK.
    Bash is never AUTO because any command can modify state."""
    if self._check_blacklist(command):
        return PermissionLevel.DENY, True   # bypass-immune（免疫绕过）
    if self.is_dangerous(command):
        return PermissionLevel.DENY, False
    return PermissionLevel.ASK, False`, annotations: [
              { lines: [1, 5] as [number, number], label: "黑名单", explanation: "硬拦截列表 — 这些命令永远不执行。rm -rf /（删根）、mkfs（格式化）、dd if=（覆盖磁盘）、fork bomb（进程炸弹），全是不可逆的毁灭性操作。" },
              { lines: [7, 12] as [number, number], label: "危险模式", explanation: "需确认列表 — sudo、chmod 777、kill -9 等。比黑名单轻一级：不是必死，但可能造成严重后果。包括 git 的破坏性操作。" },
              { lines: [14, 16] as [number, number], label: "函数签名", explanation: "返回 tuple[权限等级, bypass_immune]。Bash 工具永远不返回 AUTO，因为任何 shell 命令都可能修改系统状态。" },
              { lines: [17, 18] as [number, number], label: "黑名单判断", explanation: "命中黑名单 → DENY + bypass_immune=True（双保险）。即使 YOLO 模式也必须用户确认，绝不自动执行。" },
              { lines: [19, 21] as [number, number], label: "危险与安全", explanation: "危险命令 → DENY（YOLO 下可降为 ASK）。普通命令 → ASK（需确认但不算危险）。注意：没有返回 AUTO 的路径。" },
            ] },
          t("返回值是 tuple[PermissionLevel, bool] — 权限等级 + 是否 bypass-immune", true),
        ],
      },
      {
        type: "insight",
        title: "权限判断在工具里，不在 checker 里",
        items: [
          t("工具最了解自己的危险性 — bash 知道哪些命令是破坏性的，file_edit 知道哪些路径是敏感的", true),
          t("checker 只做 mode 映射 — 拿到工具声明的等级 + 全局模式，输出最终决策"),
          t("这是「声明式安全」的设计模式：工具声明风险，框架统一执法"),
          t("好处：新增工具时只需要实现 check_permission()，不需要修改 checker 的逻辑"),
        ],
      },
      {
        type: "flow",
        title: "权限判断流程",
        items: [],
        flowSteps: [
          { label: "工具调用请求", type: "start" },
          { label: "tool.check_permission()", detail: "工具判断: DENY/ASK/AUTO + bypass_immune" },
          { label: "checker.check_permission()", detail: "应用全局 mode: normal/auto/yolo" },
          { label: "bypass_immune?", type: "decision", detail: "是 → 强制 ASK" },
          { label: "最终: AUTO?", type: "decision" },
          { label: "自动执行", type: "end" },
          { label: "最终: ASK?", type: "decision" },
          { label: "prompt_user() y/n", detail: "用户确认或拒绝" },
          { label: "执行 / 跳过", type: "end" },
        ],
        flowDirection: "vertical",
      },
      {
        type: "teacher",
        title: "CC 的权限系统更复杂",
        items: [
          t("Claude Code 的权限系统有 24 个文件，远比我们的 3 个文件复杂"),
          t("Permission Racing — hook 检查 + AI classifier + user prompt 并发执行，谁先返回用谁的结果", true),
          t("AI classifier — 用模型判断命令是否安全（不只是模式匹配），能理解语义"),
          t("Hook 系统 — 用户可以自定义 pre-tool hooks，在工具执行前拦截或修改"),
          t("我们的实现是简化版：纯规则匹配（黑名单 + 模式），没有 AI 判断，没有 hook 系统"),
        ],
      },
    ],
    questions: [
      {
        id: "l05-q1",
        question: "为什么 yolo 模式下 DENY 变 ASK 而不是 AUTO？",
        answer: "DENY 代表「真正危险」的操作（rm -rf /、fork bomb）。如果 yolo 直接 AUTO，一个恶意 prompt 就能让 agent 删掉整个文件系统。DENY→ASK 是安全底线——用户选择 yolo 是信任 agent 做日常操作，不是放弃所有安全保障。",
        hint: "想想 prompt injection 攻击场景下会发生什么",
      },
      {
        id: "l05-q2",
        question: "bypass_immune 和 DENY 有什么区别？",
        answer: "DENY 是工具声明的默认危险级别，可以被 mode 降级（yolo: DENY→ASK）。bypass_immune 是额外标记，表示「无论什么 mode 都必须 ASK」。.git/、.env 等路径是 bypass_immune 的，因为误操作后果不可逆。两者是正交的：DENY 是权限等级，bypass_immune 是保护标记。",
        hint: "一个是等级，一个是标记——它们的作用维度不同",
      },
    ],
  },
  {
    id: "l06",
    number: 6,
    title: "上下文压缩",
    subtitle: "五层 Compaction 策略",
    phase: "有脑子",
    phaseNumber: 4,
    color: "#F59E0B",
    colorClass: "text-amber",
    objective: "实现五层渐进式压缩 — 从零成本微压缩到完整模型摘要，逐层加重",
    sections: [
      {
        type: "student",
        title: "压缩设计思路：从轻到重，逐层升级",
        items: [
          t("核心原则：只在前一层不够用时才升级到下一层 — 能不花钱就不花钱", true),
          t("每层压缩后都检查 token 数是否降到阈值以下，够了就停"),
          t("触发阈值：max_context_tokens - autocompact_buffer = 128K - 13K = 115K tokens"),
          t("为什么留 13K buffer？给 assistant 回复留空间 — CC 也用 13K", true),
        ],
      },
      {
        type: "table",
        title: "五层 Compaction 对比",
        items: [],
        headers: ["Layer", "名称", "触发条件", "成本", "效果"],
        rows: [
          { cells: ["1", "Time-based microcompact", "空闲 > 60min", "Zero (无 API 调用)", "清理旧 tool results"] },
          { cells: ["2", "Cached microcompact", "tool_count > 20", "Zero", "更积极地清理 tool results"], highlight: true },
          { cells: ["3", "Session memory", "Layer 2 不够用", "Zero", "用磁盘上的持久化摘要替代旧消息"] },
          { cells: ["4", "Full compact", "仍然超预算", "1 次 API 调用", "模型生成结构化摘要"], highlight: true },
          { cells: ["5", "API-native", "仅 Anthropic API", "Zero", "服务端 max_tokens/truncation 参数"] },
        ],
        caption: "Layer 1-3 完全免费，Layer 4 花一次 API 调用，Layer 5 靠 API 提供商支持",
      },
      {
        type: "insight",
        title: "先清理 tool results，再清理对话",
        items: [
          t("tool results 信息密度低 — 一次 file_read 可能返回 500 行代码，但真正有用的可能只有 3 行", true),
          t("对话消息信息密度高 — 用户的意图、决策、偏好都在对话里"),
          t("所以 Layer 1-2 只清理 tool results，Layer 3-4 才动对话消息"),
          t("清理不是删除 — 原始内容持久化到 .agent/context/tool_results/，上下文里替换为路径标记", true),
        ],
      },
      {
        type: "code",
        title: "源码：Layer 1 Time-based Microcompact (compact.py)",
        items: [
          t("空闲超过 60 分钟 → KV Cache 已过期（cache miss），反正要重新计算，不如趁机清理", false),
          { text: "", code: `def layer1_time_based_microcompact(
    messages: list[dict],
    config: CompactConfig,
    state: CompactState,
) -> tuple[list[dict], bool]:
    """Clear old tool results if there's been a long idle gap."""

    if state.idle_seconds < config.idle_gap_seconds:
        return messages, False

    # 找到 tool result 消息，保留最近的 N 条
    tool_result_indices = [
        i for i, msg in enumerate(messages)
        if msg.get("role") == "tool"
    ]

    if len(tool_result_indices) <= config.keep_recent_results:
        return messages, False

    # 清理所有旧的，只保留最近 5 条
    to_clear = tool_result_indices[:-config.keep_recent_results]

    for i in to_clear:
        msg = messages[i]
        content = msg.get("content", "")
        if content and not content.startswith("[Cleared"):
            tool_call_id = msg.get("tool_call_id", f"unknown_{i}")
            save_tool_result(tool_call_id, "unknown", content)  # 持久化
            messages[i] = {
                **msg,
                "content": f"[Cleared: old tool result. See .agent/context/tool_results/{tool_call_id}.txt]",
            }`, annotations: [
              { lines: [1, 6] as [number, number], label: "函数签名", explanation: "接收消息列表、配置和状态，返回处理后的消息和是否有变更。Layer 1 是最轻量的压缩，零 API 调用成本。" },
              { lines: [8, 9] as [number, number], label: "空闲检查", explanation: "核心触发条件：空闲超过 60 分钟才执行。因为长时间空闲后 KV Cache 已过期（cache miss），反正要重新计算，趁机清理不浪费。" },
              { lines: [11, 15] as [number, number], label: "收集索引", explanation: "用列表推导找出所有 role='tool' 的消息索引。这些是工具返回结果，信息密度低但占用 token 多。" },
              { lines: [17, 18] as [number, number], label: "数量检查", explanation: "如果 tool result 总数不超过保留数量（默认 5 条），无需清理，提前返回。" },
              { lines: [20, 21] as [number, number], label: "计算清理范围", explanation: "切片操作：保留最近 N 条，其余全部标记为待清理。最近的结果可能还在被模型引用，不能删。" },
              { lines: [23, 32] as [number, number], label: "持久化替换", explanation: "逐个处理待清理的消息：先持久化原始内容到磁盘文件，再用路径标记替换原文。不是删除而是「存档+缩短」，需要时可恢复。" },
            ] },
          t("保留最近 5 个 tool results — 模型可能还在引用最近的结果", true),
        ],
      },
      {
        type: "code",
        title: "源码：Layer 4 Full Compact — 模型生成结构化摘要 (compact.py)",
        items: [
          t("最重的一层：调一次 API 让模型总结整个对话。输出结构化摘要（Task/Progress/State/Context）", false),
          { text: "", code: `async def layer4_full_compact(
    messages: list[dict],
    config: CompactConfig,
    api_key: str,
) -> list[dict]:
    """Model-generated summary of the full conversation."""

    # 第 1 步：持久化历史快照（压缩前保存）
    save_history_snapshot(messages)

    # 第 2 步：计算哪些消息需要原样保留
    keep_tokens = 0
    keep_from = len(messages)
    for i in range(len(messages) - 1, -1, -1):
        msg_tokens = estimate_tokens([messages[i]])
        if keep_tokens + msg_tokens > config.sm_max_tokens:
            break
        keep_tokens += msg_tokens
        keep_from = i

    to_summarize = messages[:keep_from]
    to_keep = messages[keep_from:]

    # 第 3 步：构建摘要 prompt（结构化输出）
    summary_prompt = (
        "Summarize this conversation segment. Structure:\\n"
        "## Task\\nWhat the user is trying to accomplish.\\n"
        "## Progress\\nWhat has been done so far.\\n"
        "## Current State\\nWhere things stand now.\\n"
        "## Key Context\\nImportant details needed to continue.\\n"
        f"--- CONVERSATION ({len(to_summarize)} messages) ---\\n"
        f"{conversation_text}"
    )

    summary = await call_api(
        api_key=api_key,
        model=config.model,
        system="You are a conversation summarizer.",
        messages=[{"role": "user", "content": summary_prompt}],
        max_tokens=config.summary_max_tokens,
    )

    # 第 4 步：更新 session memory（供下次 Layer 3 使用）
    save_session_memory(summary)

    # 第 5 步：构建压缩后的输出
    return [
        {"role": "user", "content": f"[COMPACT BOUNDARY]\\n{summary}\\n[END SUMMARY]"},
        {"role": "assistant", "content": "Understood. Continuing."},
    ] + to_keep  # 最近的消息原样保留`, annotations: [
              { lines: [1, 6] as [number, number], label: "函数签名", explanation: "异步函数，需要 API 调用。这是最重的压缩层 — 花一次 API 调用让模型总结整个对话。" },
              { lines: [8, 9] as [number, number], label: "历史快照", explanation: "压缩前先保存完整历史到磁盘。压缩是有损操作，保留快照是为了可恢复 — 防止摘要丢失关键信息。" },
              { lines: [11, 22] as [number, number], label: "分割消息", explanation: "从后往前扫描，按 token 预算划分：最近的消息原样保留（模型可能还在引用），旧的消息送去摘要。保留区大小由 sm_max_tokens 控制。" },
              { lines: [24, 33] as [number, number], label: "摘要 prompt", explanation: "结构化输出模板：Task/Progress/State/Context 四段式。强制模型按结构输出，确保摘要包含继续对话所需的所有维度。" },
              { lines: [35, 41] as [number, number], label: "调用 API", explanation: "唯一的 API 调用 — 用专门的 summarizer 角色生成摘要。model 和 max_tokens 由配置控制，避免摘要本身占用过多 token。" },
              { lines: [43, 44] as [number, number], label: "更新记忆", explanation: "关键副作用：将摘要写入 session_memory.md。下次压缩时 Layer 3 可以直接读这个文件，省掉 API 调用。" },
              { lines: [46, 50] as [number, number], label: "拼装输出", explanation: "摘要包装为 user+assistant 消息对（模拟一轮对话），拼接上保留的最近消息。[COMPACT BOUNDARY] 标记让模型知道前面的内容是摘要。" },
            ] },
          t("Layer 4 的副产物：更新 session_memory.md — 下次 Layer 3 就能用这个摘要，省一次 API 调用", true),
        ],
      },
      {
        type: "insight",
        title: "KV Cache 友好 — system prompt 不变，压缩只影响 messages",
        items: [
          t("system prompt 在所有轮次共享 KV Cache 前缀 — 如果修改 system prompt，之前所有轮次的 cache 全部失效", true),
          t("所以压缩只动 messages 数组，永远不动 system prompt"),
          t("Layer 1-2 清理 tool results → messages 中间部分变短，但前缀（system）不变"),
          t("Layer 4 把旧消息替换为摘要 → messages 头部变了，但 system 不变 → cache 前缀仍然有效", true),
        ],
      },
      {
        type: "student",
        title: "Circuit Breaker — 压缩失败保护",
        items: [
          t("compact_failures 计数器 — 每次 Layer 4 API 调用失败 +1，成功则 reset"),
          t("达到 max_failures=3 后停止尝试 — 避免死循环（压缩失败 → token 超限 → 再压缩 → 再失败...）", true),
          t("force=True 可以跳过 circuit breaker — 用户手动 /compact 时使用"),
        ],
      },
      {
        type: "code",
        title: "源码：CompactState 与 Circuit Breaker (compact.py)",
        items: [
          t("模块级状态，压缩成功后 reset — 和 CC 的设计一致", false),
          { text: "", code: `@dataclass
class CompactState:
    last_assistant_time: float = 0.0
    tool_result_count: int = 0
    compact_failures: int = 0     # 熔断器计数
    max_failures: int = 3

    @property
    def circuit_broken(self) -> bool:
        return self.compact_failures >= self.max_failures

# 在 orchestrator 中：
async def run_compaction(messages, config, api_key, state=None, force=False):
    if state.circuit_broken and not force:
        return messages  # 失败次数过多，停止尝试

    # Layer 1 → Layer 2 → Layer 3 → Layer 4
    # 每层检查：还超阈值吗？→ 尝试下一层

    try:
        result = await layer4_full_compact(messages, config, api_key)
        state.reset()       # 成功：清零失败计数
        return result
    except Exception:
        state.compact_failures += 1  # 失败：计数 +1
        return messages              # 返回当前消息（未压缩）`, annotations: [
              { lines: [1, 6] as [number, number], label: "状态定义", explanation: "模块级状态 dataclass — 追踪空闲时间、tool result 数量和压缩失败次数。compact_failures 是熔断器的核心计数器。" },
              { lines: [8, 10] as [number, number], label: "熔断器", explanation: "computed property：失败次数 >= 阈值时返回 True。和微服务的 circuit breaker 同理 — 连续失败说明 API 可能有问题，继续重试只会浪费资源。" },
              { lines: [12, 15] as [number, number], label: "入口函数", explanation: "压缩编排器入口。先检查熔断器状态 — 如果已熔断且非强制（用户手动 /compact），直接跳过。" },
              { lines: [17, 18] as [number, number], label: "逐层尝试", explanation: "核心策略：从 Layer 1 到 Layer 4 逐层尝试，每层检查 token 是否降到阈值以下，够了就停。" },
              { lines: [20, 26] as [number, number], label: "容错处理", explanation: "try/except 包裹 API 调用：成功则 reset 计数器（恢复健康），失败则 +1（逼近熔断）。失败时返回原消息，不丢数据。" },
            ] },
        ],
      },
      {
        type: "code",
        title: "源码：Token 估算 (token_counter.py)",
        items: [
          t("char/4 粗估：英文 ~4 chars/token，中文 ~2 chars/token，偏差 <30%，对阈值判断够用", false),
          { text: "", code: `def estimate_tokens(messages: list[dict]) -> int:
    """Rough token estimate: ~4 chars per token.

    Why char/4:
    - English averages ~4 chars/token, Chinese ~2 chars/token
    - We're using this for threshold checks, not billing
    - Off by 20-30% is fine for "should we compact?" decisions
    - tiktoken adds a dependency and ~10ms per call
    """
    total_chars = 0
    for msg in messages:
        total_chars += 16  # role 字段开销（约 4 tokens）
        content = msg.get("content", "")
        if isinstance(content, str):
            total_chars += len(content)
        elif isinstance(content, list):
            for block in content:
                total_chars += len(json.dumps(block, ensure_ascii=False))
        # 计算 tool_calls 参数的字符数
        for tc in msg.get("tool_calls", []):
            total_chars += len(json.dumps(tc, ensure_ascii=False))
    return total_chars // 4`, annotations: [
              { lines: [1, 9] as [number, number], label: "设计说明", explanation: "docstring 解释了为什么用粗估而不是 tiktoken：这只用于阈值判断，不用于计费。20-30% 误差对「该不该压缩」的决策完全可以接受。" },
              { lines: [10, 12] as [number, number], label: "基础开销", explanation: "每条消息固定加 16 字符（约 4 tokens）作为 role 字段和消息结构的开销估算。" },
              { lines: [13, 18] as [number, number], label: "内容计算", explanation: "区分 content 类型：字符串直接取长度，列表（多模态内容）则序列化后取长度。ensure_ascii=False 保证中文字符不被转义为 \\uXXXX。" },
              { lines: [19, 22] as [number, number], label: "工具调用", explanation: "tool_calls 也占 token — 函数名和参数的 JSON 序列化。最后除以 4 得到粗略 token 数。" },
            ] },
          t("CC 也用估算触发压缩，精确计数只用于 telemetry/billing", true),
        ],
      },
      {
        type: "teacher",
        title: "CC 的 compaction 更复杂",
        items: [
          t("Claude Code 的压缩系统有 11 个文件、7 层策略 — 我们的 5 层是简化版"),
          t("CC 的层次：snip → micro-compact → collapse → summarize → API-native...", true),
          t("Post-injection — 压缩后重新注入最近读过的文件内容，因为模型压缩后可能「忘了」正在编辑什么", true),
          t("Cache edits — Anthropic API 独有功能，可以在不破坏 KV Cache 前缀的情况下删除 tool_use blocks"),
          t("我们用 OpenAI API 没有 cache_edits，所以 Layer 2 只能模拟（accept the cache miss）"),
        ],
      },
      {
        type: "flow",
        title: "五层压缩执行流程",
        items: [],
        flowSteps: [
          { label: "token > 115K?", type: "start" },
          { label: "L1: Time-based", detail: "空闲 > 60min → 清理旧 tool results", type: "process" },
          { label: "够了？", type: "decision" },
          { label: "L2: Cached MC", detail: "tool_count > 20 → 更积极清理", type: "process" },
          { label: "够了？", type: "decision" },
          { label: "L3: Session Memory", detail: "读磁盘摘要替代旧消息", type: "process" },
          { label: "够了？", type: "decision" },
          { label: "L4: Full Compact", detail: "1 次 API 调用生成摘要", type: "process" },
          { label: "完成", type: "end" },
        ],
        flowDirection: "vertical",
      },
    ],
    questions: [
      {
        id: "l06-q1",
        question: "为什么 token 计数用 len(text)/4 而不是真正的 tokenizer？",
        answer: "tiktoken 库需要下载模型文件（~3MB），且调用有开销（~10ms/call）。char/4 在英文场景下和真实 token 数偏差 <15%（中文会更大，~30%）。对于压缩触发阈值来说，这个误差完全可以接受——早压缩一点比晚压缩好。CC 也用估算而不是精确计数来触发压缩。",
        hint: "想想这个估算是用来做什么的——是计费还是触发阈值？",
      },
      {
        id: "l06-q2",
        question: "为什么压缩后要保留 system prompt 不动？",
        answer: "KV Cache。system prompt 在所有轮次共享缓存前缀。如果压缩修改了 system prompt，之前所有轮次的 KV cache 全部失效，等于浪费了之前所有的计算。所以压缩只动 messages，不动 system。这也是为什么 Layer 4 的摘要放在 messages 里（作为 user message），而不是塞进 system prompt。",
        hint: "想想 API 调用时哪些部分可以复用缓存",
      },
      {
        id: "l06-q3",
        question: "Layer 3 和 Layer 4 的关系是什么？为什么不直接跳到 Layer 4？",
        answer: "Layer 3 用的是上一次 Layer 4 的副产物（session_memory.md）。第一次压缩只能走 Layer 4（没有历史摘要），但之后的压缩可以用 Layer 3 免费完成。这是「用过去的计算结果来避免未来的计算」——Layer 4 每次成功都会 save_session_memory()，为下一次 Layer 3 铺路。",
        hint: "看看 Layer 4 成功后做了什么副作用",
      },
    ],
  },
];
