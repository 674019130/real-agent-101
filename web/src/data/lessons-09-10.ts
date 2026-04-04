import { Lesson, ContentItem, CodeAnnotation } from "./lessons";

const t = (text: string, key = false, code?: string): ContentItem => ({ text, key, code });

export const lessons0910: Lesson[] = [
  {
    id: "l09",
    number: 9,
    title: "Skill & Command",
    subtitle: "渐进式披露 — 按需加载",
    phase: "有脑子",
    phaseNumber: 4,
    color: "#F59E0B",
    colorClass: "text-amber",
    objective: "实现两层渐进式披露 — Layer 1 系统提示词只放摘要，Layer 2 通过 Skill 工具按需加载完整内容",
    sections: [
      {
        type: "student",
        title: "渐进式披露的核心问题",
        items: [
          t("10 个 skill 每个 2K tokens = 20K tokens 的 system prompt。大部分 skill 在一次对话中用不到", true),
          t("Layer 1（始终存在）：系统提示词只注入 name + description 列表，每个 skill ~50 tokens，10 个 skill ~500 tokens"),
          t("Layer 2（按需加载）：用户调用 /skill-name 或模型通过 Skill 工具触发时，才加载完整正文"),
          t("全部加载 (20K tokens) vs 只加载摘要 (500 tokens) — 40x token 节省", true),
        ],
      },
      {
        type: "insight",
        title: "40x Token 节省",
        items: [
          t("Layer 1 只注入 name + description (~50 tokens/skill x 10 = 500 tokens) vs 全部正文 (20K tokens)", true),
          t("这不只是省钱 — 更短的 system prompt 意味着更快的首次响应（更少的 KV cache 预填充）"),
          t("Claude Code 也用同样的策略：系统提示词里只列 skill 名和描述，完整内容通过 Skill 工具按需加载"),
        ],
      },
      {
        type: "table",
        title: "Skill vs Command 对比",
        items: [],
        headers: ["特性", "Skill", "Command"],
        rows: [
          { cells: ["触发方式", "模型自动判断", "用户输入 /xxx"], highlight: true },
          { cells: ["披露层级", "两层（摘要 -> 按需加载）", "无（直接全文展开）"] },
          { cells: ["加载方式", "Skill 工具调用", "展开为 user message"] },
          { cells: ["适合场景", "模型需要指导时", "固定流程（如 /commit）"] },
          { cells: ["权限", "AUTO（自动通过）", "不适用（用户主动触发）"] },
        ],
      },
      {
        type: "code",
        title: "源码：SkillTool — enum 约束 + AUTO 权限 (skill.py)",
        items: [
          t("enum 约束是关键设计：模型只能传已注册的 skill 名，不可能编造不存在的 skill。比在 description 里写「只能用这些名字」更有效。", true),
          { text: "", code: `class SkillTool(Tool):
    def __init__(self, skills: list[SkillMeta]):
        # 建索引：name -> SkillMeta，O(1) 查找
        self._skills = {s.name: s for s in skills}

    @property
    def input_schema(self) -> dict:
        # enum 约束：模型只能传已注册的 skill 名
        # 这比在 description 里写"只能用这些名字"更有效
        return {
            "type": "object",
            "properties": {
                "skill": {
                    "type": "string",
                    "enum": list(self._skills.keys()),
                    "description": "The skill name to load.",
                },
            },
            "required": ["skill"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        # 纯读操作：加载文件内容，不修改任何状态
        return True

    def check_permission(self, **_) -> tuple[PermissionLevel, bool]:
        # Skill 加载永远自动通过：
        # - 只是读文件，没有副作用
        # - 如果每次加载都要用户确认，渐进式披露就没意义了
        return PermissionLevel.AUTO, False

    async def execute(self, skill: str = "", **_) -> str:
        meta = self._skills.get(skill)
        if not meta:
            available = ", ".join(self._skills.keys())
            return f"Error: skill '{skill}' not found. Available: {available}"
        body = load_skill_body(meta)
        return f"# Skill: {meta.name}\\n\\n{body}"`, annotations: [
            { lines: [1, 4] as [number, number], label: "初始化索引", explanation: "将 skill 列表转为 name->SkillMeta 字典，后续 O(1) 查找，避免每次调用都遍历列表" },
            { lines: [6, 20] as [number, number], label: "枚举约束", explanation: "input_schema 用 enum 限制模型只能传已注册的 skill 名，比自然语言约束更可靠，防止模型编造不存在的名字" },
            { lines: [22, 25] as [number, number], label: "并发安全", explanation: "纯读操作不修改状态，标记为并发安全，允许模型同时加载多个 skill" },
            { lines: [27, 31] as [number, number], label: "AUTO权限", explanation: "Skill 加载只是读文件，无副作用。若每次都要用户确认，渐进式披露的延迟优势就被交互延迟抵消" },
            { lines: [33, 39] as [number, number], label: "按需加载", explanation: "Layer 2 执行：根据 skill 名查找元数据，加载完整正文返回给模型。找不到时返回可用列表帮助模型自纠" },
          ] },
        ],
      },
      {
        type: "code",
        title: "源码：_parse_front_matter() — 正则解析，零依赖 (loader.py)",
        items: [
          t("front matter 只有 name 和 description 两个字段，简单的正则 + split 就够了。不引入 pyyaml 是生产级代码的原则：不引入不必要的依赖。"),
          { text: "", code: `def _parse_front_matter(content: str) -> tuple[dict, str]:
    """解析 Markdown 文件的 YAML front matter。

    为什么不用 yaml 库:
        front matter 只有 name 和 description 两个字段，
        简单的正则就够了，不需要引入 pyyaml 依赖。
    """
    # 匹配 --- 开头和结尾包围的 front matter 块
    match = re.match(r'^---\\s*\\n(.*?)\\n---\\s*\\n(.*)', content, re.DOTALL)
    if not match:
        return {}, content

    front_matter_text = match.group(1)
    body = match.group(2)

    # 逐行解析 key: value
    meta = {}
    for line in front_matter_text.strip().split('\\n'):
        line = line.strip()
        if ':' in line:
            key, _, value = line.partition(':')
            meta[key.strip()] = value.strip()

    return meta, body`, annotations: [
            { lines: [1, 7] as [number, number], label: "函数签名", explanation: "返回 (meta_dict, body_str) 元组。docstring 解释了不用 pyyaml 的设计决策：字段太少，正则足够" },
            { lines: [8, 11] as [number, number], label: "正则匹配", explanation: "用 re.DOTALL 匹配 --- 包围的 front matter 块。匹配失败时返回空字典和原始内容，不抛异常" },
            { lines: [13, 14] as [number, number], label: "分离内容", explanation: "正则的两个捕获组分别是 front matter 文本和 body 正文" },
            { lines: [16, 22] as [number, number], label: "逐行解析", explanation: "用 partition(':') 而非 split(':') 拆分 key:value，因为 value 中可能包含冒号" },
            { lines: [24, 24] as [number, number], label: "返回结果", explanation: "返回解析后的元数据字典和去掉 front matter 的正文" },
          ] },
        ],
      },
      {
        type: "code",
        title: "源码：scan_skills() — Layer 1 轻量扫描 (loader.py)",
        items: [
          t("只读取 front matter（name + description），不读 body。没有 description 的 skill 不注册 — 模型无法判断何时使用。"),
          { text: "", code: `def scan_skills() -> list[SkillMeta]:
    """扫描 skills 目录，提取所有 skill 的元数据。
    只读取 front matter（name + description），不读 body。
    这是渐进式披露的 Layer 1：轻量扫描。
    """
    skills = []
    if not os.path.isdir(SKILLS_DIR):
        return skills

    for filename in sorted(os.listdir(SKILLS_DIR)):
        if not filename.endswith('.md'):
            continue
        file_path = os.path.join(SKILLS_DIR, filename)
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        meta, _ = _parse_front_matter(content)
        name = meta.get('name', filename[:-3])
        description = meta.get('description', '')

        if not description:
            continue  # 没有 description 的 skill 不注册

        skills.append(SkillMeta(
            name=name, description=description, file_path=file_path,
        ))
    return skills`, annotations: [
            { lines: [1, 5] as [number, number], label: "函数签名", explanation: "Layer 1 轻量扫描：只提取元数据（name + description），不读取 body 正文，节省启动时间" },
            { lines: [6, 8] as [number, number], label: "防御检查", explanation: "目录不存在时返回空列表，不抛异常。skills 目录是可选的" },
            { lines: [10, 15] as [number, number], label: "遍历文件", explanation: "sorted() 保证加载顺序确定性。只处理 .md 文件，跳过其他格式" },
            { lines: [17, 19] as [number, number], label: "解析元数据", explanation: "调用 _parse_front_matter 只取 meta，忽略 body（用 _ 丢弃）。name 缺失时用文件名兜底" },
            { lines: [21, 22] as [number, number], label: "过滤无效", explanation: "没有 description 的 skill 不注册 — 模型无法判断何时使用一个没有描述的 skill" },
            { lines: [24, 27] as [number, number], label: "构建结果", explanation: "将合法的 skill 封装为 SkillMeta 对象，保存 file_path 供 Layer 2 按需加载时读取" },
          ] },
        ],
      },
      {
        type: "flow",
        title: "Skill 加载流程",
        items: [],
        flowSteps: [
          { label: "启动扫描", type: "start" },
          { label: "scan_skills()", detail: "只读 front matter" },
          { label: "注入 system prompt", detail: "name + description 列表" },
          { label: "用户提问", type: "process" },
          { label: "模型判断需要 skill?", type: "decision" },
          { label: "调用 Skill 工具", detail: "load_skill_body()" },
          { label: "完整正文进入上下文", type: "end" },
        ],
        flowDirection: "vertical",
      },
      {
        type: "teacher",
        title: "策略定义型 Prompt Engineering",
        items: [
          t("这是策略定义型 prompt engineering — enum 约束比在 description 里写「只能用这些名字」更有效", true),
          t("schema 层面的约束 > 自然语言约束。enum 在 API 层面约束模型输出，模型只能选已注册的 skill 名，不可能编造不存在的 skill"),
          t("如果用 string 类型，模型可能传 \"frontend\" 而实际名字是 \"frontend-design\" — 一字之差就 404"),
          t("AUTO 权限也是策略决策 — 如果每次加载 skill 都要用户确认，渐进式披露的延迟优势就被交互延迟抵消了"),
          t("Command 没有渐进式披露 — 因为是用户主动触发（/commit），不需要模型自己判断，直接全文展开为 user message"),
        ],
      },
    ],
    questions: [
      {
        id: "l09-q1",
        question: "为什么 Skill 工具的 schema 用 enum 而不是 string？",
        answer: "enum 在 API 层面约束模型输出 — 模型只能选已注册的 skill 名，不可能编造不存在的 skill。如果用 string，模型可能传 \"frontend\" 而实际名字是 \"frontend-design\"。schema 约束 > 自然语言约束，这是 L03 讨论过的原则。",
        hint: "想想模型传了一个不存在的 skill 名会发生什么",
      },
      {
        id: "l09-q2",
        question: "为什么不用 pyyaml 解析 front matter？",
        answer: "front matter 只有 name 和 description 两个字段，简单的正则 + split 就够了。引入 pyyaml 意味着多一个依赖（安装、版本管理、安全更新）。不引入不必要的依赖是生产级代码的原则。",
        hint: "想想 front matter 实际有多少字段",
      },
    ],
  },
  {
    id: "l10",
    number: 10,
    title: "System Prompt 集成",
    subtitle: "9 组件 + KV Cache 友好架构",
    phase: "有脑子",
    phaseNumber: 4,
    color: "#F59E0B",
    colorClass: "text-amber",
    objective: "组装完整 system prompt — 9 个静态组件一次构建 + system-reminder 动态注入 + CLAUDE.md 加载 + Web Search",
    sections: [
      {
        type: "student",
        title: "System Prompt 的架构 — 一次组装，永不改变",
        items: [
          t("所有组件在启动时收集并拼接。之后每轮对话复用同一个字符串", true),
          t("原因：KV Cache。system prompt 在所有轮次间共享缓存前缀。如果每轮重建 system prompt，缓存前缀失效 -> token 浪费"),
          t("静态信息 -> system prompt（角色、环境、工具指南、CLAUDE.md）"),
          t("动态信息 -> system-reminder 标签，注入到 user message 中"),
          t("拼接顺序有讲究：角色定义在最前面（primacy effect），工具指南紧跟，CLAUDE.md 在后面"),
        ],
      },
      {
        type: "table",
        title: "9 组件清单",
        items: [],
        headers: ["#", "Component", "Source", "Static?"],
        rows: [
          { cells: ["1", "角色定义", "Hardcoded", "Yes"], highlight: true },
          { cells: ["2", "工具使用指南", "Registry + hardcoded", "Yes"] },
          { cells: ["3", "环境信息", "OS/Shell/CWD/Git", "Yes (per startup)"] },
          { cells: ["4", "模型信息", "Config", "Yes"] },
          { cells: ["5", "上下文持久化路径", ".agent/context/", "Yes"] },
          { cells: ["6", "Git 状态快照", "git status/log", "Yes (per startup)"] },
          { cells: ["7", "CLAUDE.md", "File read", "Yes (per startup)"] },
          { cells: ["8", "Skills 摘要", "scan_skills()", "Yes (per startup)"] },
          { cells: ["9", "Commands 列表", "scan_commands()", "Yes (per startup)"] },
        ],
        caption: "per startup = 每次启动时收集一次，运行期间不变",
      },
      {
        type: "insight",
        title: "静态/动态分离的原因",
        items: [
          t("system prompt 变一个字符 -> KV cache prefix 全部失效", true),
          t("日期放 system-reminder（每轮注入到 user message），不放 system prompt"),
          t("Git status 每次操作后可能变 — 也不能放 system prompt。启动时的快照可以放（因为不会变）"),
          t("放到 messages 末尾，只影响最后几个 token 的计算，不破坏 cache 前缀"),
        ],
      },
      {
        type: "code",
        title: "源码：build_system_prompt() — 9 组件组装顺序 (system.py)",
        items: [
          t("启动时调用一次，之后不再改变。参数全部在启动时确定。"),
          { text: "", code: `def build_system_prompt(
    registry: ToolRegistry,
    model: str,
    skills: list[SkillMeta],
    commands: list[CommandMeta],
) -> str:
    """组装完整的 system prompt。在 agent 启动时调用一次，之后不再改变。"""
    components: list[str] = []

    # 1. 角色定义（最高权重位置）
    components.append(ROLE_PROMPT)

    # 2. 工具使用指南（紧跟角色，避免 bash 代替一切）
    components.append(get_tool_guide(registry))

    # 3. 环境信息
    components.append(get_environment_prompt())

    # 4. 模型信息
    components.append(f"# Model\\nYou are powered by {model}.")

    # 5. 上下文持久化
    context_desc = get_context_dir_description()
    if context_desc:
        components.append(f"# Context Persistence\\n{context_desc}")

    # 6. Git status 快照
    git_snapshot = get_git_status_snapshot()
    if git_snapshot:
        components.append(git_snapshot)

    # 7. CLAUDE.md（项目级 + 用户级）
    claude_md_entries = load_claude_md()
    claude_md_prompt = format_claude_md_prompt(claude_md_entries)
    if claude_md_prompt:
        components.append(claude_md_prompt)

    # 8. Skills 摘要（Layer 1 of progressive disclosure）
    skills_prompt = get_skills_prompt(skills)
    if skills_prompt:
        components.append(skills_prompt)

    # 9. Commands 列表
    commands_prompt = get_commands_prompt(commands)
    if commands_prompt:
        components.append(commands_prompt)

    # 拼接：双换行分隔，filter 掉空字符串
    return "\\n\\n".join(filter(None, components))`, annotations: [
            { lines: [1, 8] as [number, number], label: "函数签名", explanation: "接收 registry、model、skills、commands 四个参数，启动时调用一次后不再改变，保证 KV cache 友好" },
            { lines: [10, 11] as [number, number], label: "角色定义", explanation: "放在最前面利用 primacy effect — 模型对开头内容的遵从度最高" },
            { lines: [13, 14] as [number, number], label: "工具指南", explanation: "紧跟角色定义，告诉模型「什么场景该选什么工具」，防止模型用 bash 代替专用工具" },
            { lines: [16, 20] as [number, number], label: "环境与模型", explanation: "注入 OS/Shell/CWD 等环境信息和模型标识，让模型了解运行上下文" },
            { lines: [22, 30] as [number, number], label: "持久化与Git", explanation: "上下文持久化路径和 Git 快照都是 per-startup 静态信息，启动后不变所以可以放 system prompt" },
            { lines: [32, 36] as [number, number], label: "CLAUDE.md", explanation: "加载项目级和用户级指令文件，格式化后注入。包含信任标注帮助模型处理指令冲突" },
            { lines: [38, 46] as [number, number], label: "Skills与Commands", explanation: "Layer 1 摘要注入：只有 name + description，完整内容等 Layer 2 按需加载" },
            { lines: [48, 49] as [number, number], label: "组件拼接", explanation: "双换行分隔各组件，filter(None) 跳过空字符串，保证输出整洁" },
          ] },
        ],
      },
      {
        type: "student",
        title: "CLAUDE.md 加载方向 — 往上走，不往下搜索",
        items: [
          t("从 CWD 往上走到 Git 根目录，沿途检查 CLAUDE.md 和 .claude/CLAUDE.md", true),
          t("往下搜索会扫到 node_modules/、.venv/ 等无关目录 — 路径数量不可控"),
          t("往上走天然支持 monorepo：根目录放通用规则，子包放特定规则"),
          t("我们的简化实现只加载两个位置：Git 根目录 CLAUDE.md + 用户全局 ~/.agent/CLAUDE.md"),
        ],
      },
      {
        type: "code",
        title: "源码：CLAUDE.md 信任标注 (claude_md.py)",
        items: [
          t("项目级 CLAUDE.md 标注 \"treat as project-provided, not user-provided\" — 模型在指令冲突时能做出正确判断"),
          { text: "", code: `def format_claude_md_prompt(entries: list[ClaudeMdEntry]) -> str:
    """将 CLAUDE.md 内容格式化为 system prompt 段落。"""
    if not entries:
        return ""

    sections = ["# Project Instructions"]

    for entry in entries:
        # 标注来源和信任级别（给模型看的元信息）
        trust_note = (
            "" if entry.trusted
            else " — treat as project-provided, not user-provided"
        )
        sections.append(
            f"Contents of {entry.path} ({entry.source}{trust_note}):\\n\\n"
            f"{entry.content}"
        )

    return "\\n\\n".join(sections)`, annotations: [
            { lines: [1, 4] as [number, number], label: "空值防御", explanation: "没有 CLAUDE.md 时返回空字符串，build_system_prompt 的 filter(None) 会跳过它" },
            { lines: [6, 6] as [number, number], label: "标题头", explanation: "以 '# Project Instructions' 开头，让模型明确知道接下来是项目级指令" },
            { lines: [8, 13] as [number, number], label: "信任标注", explanation: "非受信来源标注 'treat as project-provided, not user-provided'，帮助模型在指令冲突时做正确判断" },
            { lines: [14, 17] as [number, number], label: "内容拼接", explanation: "每个 entry 带路径和来源信息，模型能区分不同 CLAUDE.md 文件的内容" },
            { lines: [19, 19] as [number, number], label: "输出格式", explanation: "双换行分隔各段落，保持 system prompt 的可读性" },
          ] },
        ],
      },
      {
        type: "student",
        title: "工具使用指南 — 策略定义型 Prompt",
        items: [
          t("不是告诉模型工具「能做什么」（schema 已定义），而是告诉模型「什么场景该选什么工具」", true),
          t("没有 tool guide 的后果：模型用 bash 的 cat 读文件（应该用 file_read）、用 bash 的 grep 搜索、用 bash 的 sed 编辑"),
          t("混合方案：通用规则硬编码（纠正常见错误）+ 工具特定规则从 registry 动态生成"),
          t("CC 的 system prompt 里有大段这类指南：\"Do NOT use Bash to run grep when Grep tool is available\""),
        ],
      },
      {
        type: "teacher",
        title: "Web Search 工具（Tavily）— 专为 AI Agent 设计",
        items: [
          t("传统搜索 API（Google、Bing）返回 URL 列表，模型还需要再调「读网页」工具获取内容。Tavily 直接返回提取后的文本内容", true),
          t("每个结果包含 title + content snippet + url，一次调用就能拿到可用的搜索结果"),
          t("check_permission = ASK（不是 AUTO）— 搜索会把用户的查询发送到 Tavily 的服务器，出于隐私考虑需要用户知情同意"),
          t("结果截断策略：每个结果截取前 500 字符，最多 5 个结果，避免占用过多上下文空间"),
          t("is_concurrent_safe = True — 搜索是纯读操作，模型可以同时发起多个搜索"),
        ],
      },
      {
        type: "code",
        title: "源码：system-reminder 注入 — agent loop 中的动态信息 (main.py)",
        items: [
          t("动态信息不放 system prompt（避免 KV cache 失效），而是作为 <system-reminder> 标签追加到 user message 里"),
          { text: "", code: `def build_system_reminder() -> str:
    """生成 per-turn 动态信息，作为 system-reminder 注入。"""
    parts = []
    today = datetime.now().strftime("%Y-%m-%d")
    parts.append(f"Today's date is {today}.")

    inner = "\\n".join(parts)
    return f"<system-reminder>\\n{inner}\\n</system-reminder>"

# ── 在 agent loop 中注入 ──
# 动态信息（日期等）不放 system prompt（避免 KV cache 失效），
# 而是作为 <system-reminder> 标签追加到 user message 里。
reminder = build_system_reminder()
user_content = f"{user_input}\\n{reminder}" if reminder else user_input
messages.append({"role": "user", "content": user_content})`, annotations: [
            { lines: [1, 5] as [number, number], label: "动态信息", explanation: "每轮生成当前日期等动态信息。日期不能放 system prompt，否则跨天时 KV cache 失效" },
            { lines: [7, 8] as [number, number], label: "XML封装", explanation: "用 <system-reminder> 标签包裹，模型能区分「用户说的话」和「系统注入的元信息」" },
            { lines: [10, 15] as [number, number], label: "注入位置", explanation: "追加到 user message 末尾而非 system prompt，只影响最后几个 token 的计算，不破坏 cache 前缀" },
          ] },
        ],
      },
      {
        type: "code",
        title: "源码：build_registry_and_prompt() — 构建顺序 (main.py)",
        items: [
          t("registry 和 system prompt 一起构建，因为依赖关系：tool_guide 需要 registry，sub-agent 需要 system_prompt"),
          { text: "", code: `def build_registry_and_prompt() -> tuple[ToolRegistry, str]:
    """构建顺序: registry -> system prompt -> sub-agent -> done"""
    registry = ToolRegistry()
    registry.register(BashTool())
    registry.register(FileReadTool())
    registry.register(FileWriteTool())
    registry.register(FileEditTool())
    registry.register(TodoTool())
    registry.register(WebSearchTool())

    # Skill 工具：模型按需加载 skill 内容（Layer 2）
    if _skills:
        registry.register(SkillTool(_skills))

    # registry 就绪后再构建 system prompt（tool guide 需要工具列表）
    # 启动时构建一次，之后不变（KV cache 友好）
    system_prompt = build_system_prompt(
        registry=registry, model=MODEL,
        skills=_skills, commands=_commands,
    )

    # Sub-agent：继承所有工具，获取组装好的 system prompt
    sub_agent = SubAgentTool()
    sub_agent.configure(registry, {
        "api_key": API_KEY, "model": MODEL, "system": system_prompt,
    })
    registry.register(sub_agent)

    return registry, system_prompt`, annotations: [
            { lines: [1, 9] as [number, number], label: "注册工具", explanation: "先创建 registry 并注册所有基础工具。顺序决定了构建链：registry 必须先就绪" },
            { lines: [11, 13] as [number, number], label: "Skill工具", explanation: "有 skill 时才注册 SkillTool（Layer 2 按需加载入口），skills 为空则跳过" },
            { lines: [15, 20] as [number, number], label: "组装Prompt", explanation: "registry 就绪后才能构建 system prompt，因为 tool_guide 需要遍历已注册工具生成指南" },
            { lines: [22, 27] as [number, number], label: "子Agent", explanation: "Sub-agent 继承父 agent 的所有工具和 system prompt，最后注册进 registry 形成嵌套能力" },
            { lines: [29, 29] as [number, number], label: "返回结果", explanation: "返回 (registry, system_prompt) 元组，调用方用这两个值初始化 agent loop" },
          ] },
        ],
      },
    ],
    questions: [
      {
        id: "l10-q1",
        question: "为什么 build_registry_and_prompt() 要把 registry 和 system prompt 一起构建？",
        answer: "依赖关系：tool_guide 需要 registry（生成工具特定指南），sub-agent 需要 system_prompt（继承父 agent 的 system prompt）。构建顺序必须是：registry -> system_prompt -> sub_agent.configure()。如果分开构建，要么传递中间状态，要么全局变量，都不如合并清晰。",
        hint: "想想 tool_guide 和 sub-agent 各自需要什么",
      },
      {
        id: "l10-q2",
        question: "为什么用 XML 标签 <system-reminder> 而不是普通文本？",
        answer: "模型能区分用户说的话和系统注入的元信息。如果用普通文本 \"Today is 2026-04-04\"，模型可能以为是用户在告诉它日期（用户可能说的是另一个日期）。XML 标签是约定俗成的，模型在训练中见过，知道这是系统注入。",
        hint: "想想模型怎么区分「用户说的话」和「系统注入的信息」",
      },
      {
        id: "l10-q3",
        question: "Web Search 为什么 check_permission 是 ASK 而不是 AUTO？",
        answer: "搜索会把用户的查询发送到 Tavily 的服务器 — 这是向外部服务暴露信息。虽然搜索本身无害，但出于隐私考虑需要用户知情同意。CC 的 WebSearch 也不是 AUTO。",
        hint: "想想搜索操作涉及什么外部交互",
      },
    ],
  },
];
