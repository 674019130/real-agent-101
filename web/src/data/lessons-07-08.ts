import { Lesson, ContentItem, CodeAnnotation } from "./lessons";

const t = (text: string, key = false, code?: string): ContentItem => ({ text, key, code });

export const lessons0708: Lesson[] = [
  {
    id: "l07",
    number: 7,
    title: "并发执行器",
    subtitle: "Mid-stream 执行 + 错误级联",
    phase: "有手有眼",
    phaseNumber: 3,
    color: "#10B981",
    colorClass: "text-green",
    objective: "实现 StreamingToolExecutor — 边收流边执行工具，is_concurrent_safe 控制并发，错误级联中止",
    sections: [
      {
        type: "student",
        title: "Mid-stream Execution 概念",
        items: [
          t("传统做法：等 finish_reason 收到后，才开始执行所有 tool_calls — 串行，浪费时间"),
          t("Mid-stream 做法：一个 tool_call 的 arguments 完整了就立即提交执行，不等 message_stop", true),
          t("关键：SSE 流中每个 tool_call 的 arguments 是逐 chunk 拼接的，当一个 tool_call 完整时（content_block_stop），立刻丢进执行队列"),
          t("好处：Tool A 在执行的同时，API 还在流式输出 Tool B 的参数 — 执行和接收并行"),
        ],
      },
      {
        type: "sequence",
        title: "Mid-stream 执行时序",
        items: [
          t("工具执行和 API 流式输出并行进行，不等所有 tool_calls 接收完毕"),
        ],
        actors: ["API Stream", "Executor", "Tool A", "Tool B"],
        steps: [
          { from: "API Stream", to: "Executor", label: "tool_call[0] complete" },
          { from: "Executor", to: "Tool A", label: "start execution" },
          { from: "API Stream", to: "Executor", label: "tool_call[1] streaming...", dashed: true },
          { from: "Tool A", to: "Executor", label: "result ready" },
          { from: "API Stream", to: "Executor", label: "tool_call[1] complete" },
          { from: "Executor", to: "Tool B", label: "start execution" },
          { from: "Tool B", to: "Executor", label: "result ready" },
        ],
      },
      {
        type: "code",
        title: "源码：add_tool() — 中途提交 (executor.py)",
        items: [
          t("每个 tool_call 完整后立即调用 add_tool()，不等 finish_reason", false),
          { text: "", code: `def add_tool(self, index: int, tool_call_id: str, name: str, args_json: str):
    """Add a completed tool_call to the execution queue.

    Called mid-stream when a tool_call's arguments are fully received.
    Immediately tries to start execution if possible.
    """
    try:
        args = json.loads(args_json) if args_json else {}
    except json.JSONDecodeError:
        args = {}

    tool = self._registry.get(name)
    is_safe = tool.is_concurrent_safe if tool else False

    task = ToolTask(
        index=index,
        tool_call_id=tool_call_id,
        tool_name=name,
        tool_args=args,
        tool=tool,
        is_concurrent_safe=is_safe,
    )
    self._queue.append(task)
    self._queue_event.set()`, annotations: [
              { lines: [1, 6] as [number, number], label: "方法签名", explanation: "接收 tool_call 的 index、ID、名称和原始 JSON 参数，在流式接收过程中被调用" },
              { lines: [7, 10] as [number, number], label: "参数解析", explanation: "将 JSON 字符串反序列化为 dict，解析失败时降级为空 dict 而不是抛异常" },
              { lines: [12, 13] as [number, number], label: "并发标记", explanation: "从 registry 查找工具实例，读取 is_concurrent_safe 属性决定该任务是否可并行" },
              { lines: [15, 22] as [number, number], label: "创建任务", explanation: "将所有信息封装为 ToolTask 对象，包含调度所需的全部元数据" },
              { lines: [23, 24] as [number, number], label: "入队触发", explanation: "任务入队后立即 set event，唤醒 _process_queue 尝试调度执行" },
            ] },
        ],
      },
      {
        type: "code",
        title: "源码：_can_execute() 并发调度逻辑 (executor.py)",
        items: [
          t("三条规则：没人跑 → 直接开；自己 safe 且全部在跑的都 safe → 并行；否则等待", false),
          { text: "", code: `def _can_execute(self, task: ToolTask) -> bool:
    """Check if a task can start executing now."""
    if not self._running:
        return True
    if task.is_concurrent_safe:
        return all(t.is_concurrent_safe for t in self._running)
    return len(self._running) == 0`, annotations: [
              { lines: [1, 2] as [number, number], label: "调度入口", explanation: "判断一个任务现在能否开始执行，返回布尔值" },
              { lines: [3, 4] as [number, number], label: "空队放行", explanation: "没有任务在跑时直接放行，无论 safe 或 non-safe" },
              { lines: [5, 6] as [number, number], label: "并发判断", explanation: "safe 任务只有在所有正在运行的任务也都是 safe 时才能并行" },
              { lines: [7, 7] as [number, number], label: "独占等待", explanation: "non-safe 走到这里时 _running 必然非空，所以永远返回 False — 必须等所有任务完成" },
            ] },
          t("non-safe 工具（如 file_write）的最后一条 return len(self._running) == 0 永远是 False（因为第一个 if 已经处理了空的情况），所以 non-safe 工具必须等所有在跑的任务完成", true),
        ],
      },
      {
        type: "code",
        title: "源码：_process_queue() 队列处理 (executor.py)",
        items: [
          t("遍历队列，能跑就跑，non-safe 遇到阻塞就 break 停止后续所有任务", false),
          { text: "", code: `async def _process_queue(self):
    """Process queued tools, respecting concurrency rules."""
    self._running = [t for t in self._running if t.status == ToolStatus.RUNNING]

    for task in self._queue:
        if task.status != ToolStatus.QUEUED:
            continue

        # 错误级联：取消排队中的非只读工具
        if self._aborted and not task.is_concurrent_safe:
            task.status = ToolStatus.ABORTED
            task.result = (
                f"ABORTED: '{task.tool_name}' was cancelled because a "
                "previous tool failed. Review the error above."
            )
            continue

        if self._can_execute(task):
            await self._start_task(task)
        else:
            if not task.is_concurrent_safe:
                break`, annotations: [
              { lines: [1, 3] as [number, number], label: "清理已完成", explanation: "先过滤掉已完成的任务，只保留仍在 RUNNING 状态的，确保调度判断基于最新状态" },
              { lines: [5, 7] as [number, number], label: "跳过非排队", explanation: "遍历队列，只处理 QUEUED 状态的任务，已执行/已取消的直接跳过" },
              { lines: [9, 16] as [number, number], label: "级联取消", explanation: "如果已触发错误级联，排队中的非只读（non-safe）工具直接标记为 ABORTED 并附上原因" },
              { lines: [18, 22] as [number, number], label: "调度执行", explanation: "能执行就立即启动；non-safe 任务遇到阻塞时 break 停止后续所有任务，保证执行顺序" },
            ] },
        ],
      },
      {
        type: "insight",
        title: "is_concurrent_safe 的三重角色",
        items: [
          t("一个布尔值，三个用途 — 权限标记(L05) + 调度标记(L07) + 级联标记(L07)", true),
          t("权限：check_permission() 中，True → AUTO（自动执行），False → ASK（需用户确认）"),
          t("调度：_can_execute() 中，True → 可并行，False → 独占执行"),
          t("级联：_trigger_error_cascade() 中，bash 失败后 → True 的工具继续，False 的工具取消"),
          t("这不是巧合 — read-only 工具天然满足三个条件：不需要确认、可以并行、不受写失败影响"),
        ],
      },
      {
        type: "table",
        title: "is_concurrent_safe 三重角色对比",
        items: [],
        headers: ["角色", "使用位置", "效果"],
        rows: [
          { cells: ["Permission 权限标记", "check_permission()", "True → AUTO, False → ASK"], highlight: true },
          { cells: ["Scheduling 调度标记", "_can_execute()", "True → parallel, False → exclusive"] },
          { cells: ["Cascade 级联标记", "_trigger_error_cascade()", "bash fail → abort queued non-safe tools"] },
        ],
      },
      {
        type: "code",
        title: "源码：错误级联 _trigger_error_cascade() (executor.py)",
        items: [
          t("bash 失败后，设置 _aborted 标记，排队中的写操作被取消，读操作继续", false),
          { text: "", code: `def _trigger_error_cascade(self, failed_task: ToolTask):
    """Abort queued non-read-only siblings after a bash failure.

    Claude Code behavior (StreamingToolExecutor.ts):
    - Bash errors abort sibling tasks via siblingAbortController
    - Read-only tools do NOT cascade (they're independent)
    - Only bash triggers cascade (not file_read, not file_edit)

    This prevents a sequence like:
        bash("npm test") [FAIL] → bash("git commit") [should NOT run]
    """
    self._aborted = True
    console.print(
        f"[bold red]Error cascade:[/bold red] {failed_task.tool_name} failed, "
        "aborting remaining write operations"
    )

    # 取消非安全工具的运行中 async 任务
    for task in self._running:
        if task is not failed_task and not task.is_concurrent_safe and task._task:
            task._task.cancel()`, annotations: [
              { lines: [1, 11] as [number, number], label: "文档说明", explanation: "详细记录了 CC 的级联行为：只有 bash 触发级联，只读工具不受影响，防止失败后继续写操作" },
              { lines: [12, 16] as [number, number], label: "设置标记", explanation: "设置 _aborted 全局标记并打印警告，后续 _process_queue 会根据此标记取消排队中的写操作" },
              { lines: [18, 21] as [number, number], label: "取消运行中", explanation: "遍历正在运行的任务，cancel 掉非只读的 async task；只读任务不受影响继续执行" },
            ] },
        ],
      },
      {
        type: "code",
        title: "源码：Bash exit code 触发级联 (executor.py)",
        items: [
          t("bash 工具不会因为命令失败抛异常 — 它返回 \"Exit code: N\\n...\"，所以要额外检查字符串", false),
          { text: "", code: `async def _execute_with_timeout(self, task: ToolTask):
    timeout = BASH_TOOL_TIMEOUT if task.tool_name == "bash" else DEFAULT_TOOL_TIMEOUT

    try:
        result = await asyncio.wait_for(
            self._registry.dispatch(task.tool_name, task.tool_args),
            timeout=timeout,
        )
        task.result = result

        # Bash 错误级联：非零退出码 = 失败
        if task.tool_name == "bash" and result.startswith("Exit code:"):
            self._trigger_error_cascade(task)

    except asyncio.TimeoutError:
        task.result = f"Error: {task.tool_name} timed out after {timeout:.0f}s."
        task.status = ToolStatus.TIMED_OUT
        # Bash 超时也触发错误级联（与错误处理一致）
        if task.tool_name == "bash":
            self._trigger_error_cascade(task)

    except Exception as e:
        task.result = f"Error executing {task.tool_name}: {e}"
        if task.tool_name == "bash":
            self._trigger_error_cascade(task)`, annotations: [
              { lines: [1, 2] as [number, number], label: "超时选择", explanation: "bash 工具使用更长的超时（如 120s），其他工具用默认超时，对应 CC 的差异化超时策略" },
              { lines: [4, 9] as [number, number], label: "正常执行", explanation: "用 asyncio.wait_for 包裹工具调度，超时自动抛 TimeoutError" },
              { lines: [11, 13] as [number, number], label: "退出码检查", explanation: "关键边界：bash 不会因命令失败抛异常，而是返回 'Exit code: N' 字符串，需要额外检查触发级联" },
              { lines: [15, 20] as [number, number], label: "超时处理", explanation: "超时时记录错误并标记 TIMED_OUT 状态，bash 超时同样触发级联取消后续写操作" },
              { lines: [22, 25] as [number, number], label: "异常兜底", explanation: "捕获所有其他异常，bash 的异常也会触发级联，确保任何失败模式都不会遗漏" },
            ] },
        ],
      },
      {
        type: "student",
        title: "错误级联的设计逻辑",
        items: [
          t("场景：模型同时调了 bash(\"npm test\") + bash(\"git commit\") + file_read(\"README.md\")"),
          t("npm test 失败了 → git commit 必须取消（写操作依赖前面的状态）", true),
          t("但 file_read 可以继续 — 读操作是独立的，不会因为 npm test 失败就变得有害"),
          t("判断依据就是 is_concurrent_safe：True = 读操作 = 不受级联影响，False = 写操作 = 被取消"),
        ],
      },
      {
        type: "teacher",
        title: "CC 的 StreamingToolExecutor.ts 实现对比",
        items: [
          t("触发时机相同 — CC 在 content_block_stop 事件触发执行，不是 message_stop。我们在 tool_call arguments 拼接完成时触发", true),
          t("CC 用 siblingAbortController 做级联 — 给每批工具创建一个共享的 AbortController，bash 失败时 abort 整批"),
          t("CC 的超时更细粒度 — 不同工具有不同 timeout，bash 工具有 120 秒硬限制"),
          t("我们的实现是简化版 — 没有 AbortController 机制，用 asyncio.Task.cancel() + 状态标记实现类似效果"),
        ],
      },
    ],
    questions: [
      {
        id: "l07-q1",
        question: "为什么 non-concurrent_safe 工具要阻塞队列而不是简单地「分两批」？",
        answer: "不是分批，是队列调度。一个 non-safe 工具执行时，后续所有工具都等待（不管 safe 不 safe）。原因：non-safe 工具（如 file_write）可能改变状态，后续工具的输入可能依赖这个状态。如果「分两批」（safe 一批 non-safe 一批），non-safe 之间的顺序就丢了。比如 write_file(A) → edit_file(A)，如果并行跑就可能 edit 在 write 之前执行。",
        hint: "想想 write_file(A) 和 edit_file(A) 同时跑会怎样",
      },
      {
        id: "l07-q2",
        question: "为什么 bash 的 exit code 非零也要触发级联，不只是 exception？",
        answer: "bash 工具不会因为命令失败抛异常 — 它捕获所有输出并返回 \"Exit code: N\\n...\"。如果只检查 exception，`git push` 失败后 `file_edit` 还会继续执行，修改了不该修改的文件。所以要额外检查 result.startswith(\"Exit code:\")。这是一个容易遗漏的边界 — subprocess 的非零退出码不是 Python 异常。",
        hint: "想想 subprocess 执行失败后 Python 会抛异常吗",
      },
      {
        id: "l07-q3",
        question: "_can_execute() 中 non-safe 工具的 return len(self._running) == 0 为什么永远是 False？",
        answer: "因为前面第一个 if not self._running: return True 已经处理了队列为空的情况。走到第三个 return 时，self._running 必然非空（len > 0），所以永远返回 False。效果就是：non-safe 工具必须等所有在跑的任务都完成后，才能在下一轮 _process_queue() 中被第一个 if 放行。",
        hint: "看看三个 return 的执行顺序",
      },
    ],
  },
  {
    id: "l08",
    number: 8,
    title: "生态系统",
    subtitle: "环境信息、Hooks、Sub-Agent",
    phase: "可信赖",
    phaseNumber: 5,
    color: "#8B5CF6",
    colorClass: "text-purple",
    objective: "补全 agent 生态 — 环境信息收集、Hook 扩展机制、Sub-Agent 隔离执行",
    sections: [
      {
        type: "student",
        title: "环境信息的静态/动态分离",
        items: [
          t("静态信息（OS、Shell、Python 版本）— 几乎不变，缓存到磁盘 .agent/environment.json，只在 agent 版本变化时重新收集"),
          t("动态信息（CWD、Git branch、Git user）— 每次启动都可能不同，必须实时获取", true),
          t("如果全部缓存：用户 cd 到新目录后 agent 还以为在旧目录"),
          t("如果全部实时获取：每次启动多跑几个 subprocess，浪费几十毫秒"),
          t("策略：static 信息靠版本号判断是否过期，dynamic 信息每次启动都跑 subprocess"),
        ],
      },
      {
        type: "code",
        title: "源码：_collect_static() vs _collect_dynamic() (environment.py)",
        items: [
          t("静态信息用 platform 模块获取，动态信息用 subprocess 调 git 命令", false),
          { text: "", code: `def _collect_static() -> dict:
    """Collect static info (rarely changes, safe to cache)."""
    return {
        "agent_version": AGENT_VERSION,
        "os_name": platform.system(),
        "os_version": platform.release(),
        "shell": os.environ.get("SHELL", "unknown"),
        "python_version": platform.python_version(),
    }


def _collect_dynamic() -> dict:
    """Collect dynamic info (changes per session, always fresh)."""
    return {
        "cwd": os.getcwd(),
        "git_branch": _run_git(["rev-parse", "--abbrev-ref", "HEAD"]),
        "git_user": _run_git(["config", "user.name"]),
    }`, annotations: [
              { lines: [1, 9] as [number, number], label: "静态收集", explanation: "用 platform 模块获取 OS、Shell、Python 版本等几乎不变的信息，包含 agent_version 用于缓存校验" },
              { lines: [12, 18] as [number, number], label: "动态收集", explanation: "用 subprocess 调 git 命令获取 CWD、分支名、用户名等每次启动都可能变化的信息" },
            ] },
        ],
      },
      {
        type: "code",
        title: "源码：get_environment_info() 缓存策略 (environment.py)",
        items: [
          t("版本号匹配 → 用缓存的 static；版本号不匹配 → 重新收集 static。dynamic 每次都重新收集", false),
          { text: "", code: `def get_environment_info() -> dict:
    """Get environment info: static from cache, dynamic always fresh."""
    cached = _load_cached()

    if cached and cached.get("agent_version") == AGENT_VERSION:
        static = {k: cached[k] for k in (
            "agent_version", "os_name", "os_version",
            "shell", "python_version"
        ) if k in cached}
    else:
        static = _collect_static()

    dynamic = _collect_dynamic()
    info = {**static, **dynamic}
    _save(info)
    return info`, annotations: [
              { lines: [1, 3] as [number, number], label: "加载缓存", explanation: "从磁盘加载之前缓存的环境信息" },
              { lines: [5, 11] as [number, number], label: "版本校验", explanation: "用 agent_version 判断缓存是否过期：版本匹配用缓存，不匹配重新收集静态信息" },
              { lines: [13, 16] as [number, number], label: "合并输出", explanation: "动态信息每次都重新收集，与静态信息合并后保存到磁盘并返回" },
            ] },
        ],
      },
      {
        type: "student",
        title: "Hook 扩展机制 — 三种事件",
        items: [
          t("PreToolUse — 工具执行前触发，可以修改参数、拦截执行"),
          t("PostToolUse — 工具执行后触发，可以修改输出、记录日志"),
          t("Notification — 通知事件，不能修改任何东西，只用于通知用户"),
          t("Hook 本质是 shell 脚本 — 通过 stdin 接收 JSON，stdout 返回 JSON 决策", true),
          t("Fail-open 设计：hook 脚本崩溃或超时 → 默认 allow，不阻塞 agent"),
        ],
      },
      {
        type: "code",
        title: "源码：run_hook() 单个 hook 执行 (hooks/engine.py)",
        items: [
          t("subprocess 跑 shell 脚本，JSON I/O，5 秒超时，fail-open", false),
          { text: "", code: `async def run_hook(script: str, event_data: dict) -> HookResult:
    """Run a single hook script.
    Sends event_data as JSON to stdin, reads JSON from stdout.
    Fail-open: errors or timeout → allow.
    """
    try:
        proc = await asyncio.create_subprocess_shell(
            script,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        input_json = json.dumps(event_data, ensure_ascii=False).encode()
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=input_json),
            timeout=HOOK_TIMEOUT,  # 5 秒超时
        )

        if proc.returncode != 0:
            return HookResult(behavior="allow")  # 失败放行

        result = json.loads(stdout.decode().strip())
        return HookResult(
            behavior=result.get("behavior", "allow"),
            message=result.get("message", ""),
            modified_params=result.get("params"),
            modified_output=result.get("output"),
        )

    except asyncio.TimeoutError:
        return HookResult(behavior="allow")  # 失败放行
    except Exception as e:
        return HookResult(behavior="allow")  # 失败放行`, annotations: [
              { lines: [1, 5] as [number, number], label: "函数签名", explanation: "接收 shell 脚本路径和事件数据，通过 JSON stdin/stdout 通信，fail-open 设计" },
              { lines: [6, 12] as [number, number], label: "启动进程", explanation: "用 asyncio subprocess 异步启动 shell 脚本，绑定 stdin/stdout/stderr 管道" },
              { lines: [14, 18] as [number, number], label: "JSON通信", explanation: "将事件数据序列化为 JSON 写入 stdin，设置 5 秒超时等待进程完成" },
              { lines: [20, 21] as [number, number], label: "失败放行", explanation: "hook 脚本非零退出码时默认 allow — fail-open 核心原则，不阻塞 agent" },
              { lines: [23, 29] as [number, number], label: "解析结果", explanation: "解析 stdout JSON，提取 behavior、message、修改后的 params 和 output" },
              { lines: [31, 34] as [number, number], label: "异常兜底", explanation: "超时和任何异常都返回 allow — 三重 fail-open 保障，确保 hook 崩溃不会瘫痪 agent" },
            ] },
        ],
      },
      {
        type: "insight",
        title: "Hooks 不只是「通知」",
        items: [
          t("CC 的 hooks 可以修改工具参数（PreToolUse）和修改输出（PostToolUse），8743 行代码，27 种事件", true),
          t("PreToolUse hook 返回 {\"behavior\": \"allow\", \"params\": {...}} → 实际执行时用 hook 修改后的参数"),
          t("PostToolUse hook 返回 {\"behavior\": \"allow\", \"output\": \"...\"} → 模型看到的是 hook 过滤后的输出"),
          t("这意味着 hooks 可以做审计日志、参数注入（给 rm 加 -i）、输出脱敏（隐藏敏感信息）等"),
        ],
      },
      {
        type: "table",
        title: "Hook 事件对比：我们 vs Claude Code",
        items: [],
        headers: ["事件", "时机", "可修改", "我们的实现", "CC 实现"],
        rows: [
          { cells: ["PreToolUse", "工具执行前", "Params", "基础：allow/deny + params rewrite", "深度：param rewrite, permission override"], highlight: true },
          { cells: ["PostToolUse", "工具执行后", "Output", "基础：allow/deny + output filtering", "深度：output filtering, logging, audit"] },
          { cells: ["Notification", "各类事件", "Nothing", "基础通知", "27 种事件类型"] },
        ],
      },
      {
        type: "code",
        title: "源码：run_hooks() 链式执行 (hooks/engine.py)",
        items: [
          t("多个 hook 串行执行，任一 deny 立即停止。hook 修改的 params 会传递给下一个 hook", false),
          { text: "", code: `async def run_hooks(event: str, event_data: dict) -> HookResult:
    """Run all hooks registered for an event.
    All hooks must "allow" for the event to proceed.
    First "deny" stops execution and returns the deny result.
    If a hook modifies params, the modified params are passed to subsequent hooks.
    """
    config = load_hooks_config()
    scripts = config.get(event, [])

    if not scripts:
        return HookResult(behavior="allow")

    current_params = event_data.get("params", {})

    for script in scripts:
        data = {**event_data, "params": current_params}
        result = await run_hook(script, data)

        if result.behavior == "deny":
            return result

        # 允许 hook 修改参数，传递给下一个 hook / 实际执行
        if result.modified_params is not None:
            current_params = result.modified_params

    return HookResult(behavior="allow", modified_params=current_params)`, annotations: [
              { lines: [1, 8] as [number, number], label: "加载配置", explanation: "从配置文件加载当前事件注册的所有 hook 脚本列表" },
              { lines: [10, 11] as [number, number], label: "无hook快返", explanation: "没有注册 hook 时直接放行，避免不必要的处理" },
              { lines: [13, 17] as [number, number], label: "链式执行", explanation: "串行执行每个 hook，将当前 params 注入事件数据传给下一个 hook" },
              { lines: [19, 20] as [number, number], label: "deny短路", explanation: "任一 hook 返回 deny 立即停止整条链并返回拒绝结果" },
              { lines: [22, 24] as [number, number], label: "参数传递", explanation: "hook 可以修改 params，修改后的 params 传给下一个 hook 形成管道效果" },
              { lines: [26, 26] as [number, number], label: "最终放行", explanation: "所有 hook 都通过后返回 allow，附带最终修改后的 params 供实际工具执行使用" },
            ] },
        ],
      },
      {
        type: "student",
        title: "Sub-Agent vs Teammate",
        items: [
          t("Sub-Agent — 父 agent 通过工具调用创建，隔离上下文，返回结果后销毁。一次性任务", true),
          t("Teammate（CC 的 TeamCreate/SendMessage）— 命名 agent，SendMessage 通信，可以多轮对话"),
          t("我们简化为 Sub-Agent 模式 — 一次创建，一次返回，不支持多轮通信"),
          t("核心特点：独立的 messages list（不污染父 agent 上下文）+ 继承父工具（去掉自己防递归）+ max_turns 安全限制"),
        ],
      },
      {
        type: "code",
        title: "源码：SubAgentTool.execute() 核心逻辑 (tools/subagent.py)",
        items: [
          t("Sub-agent 有自己的 messages 列表和独立的 agent loop，完成后只返回文本结果", false),
          { text: "", code: `async def execute(self, task: str = "", max_turns: int = 10, **_) -> str:
    """Spawn a sub-agent and run it to completion."""
    registry: ToolRegistry = self._parent_registry

    # 构建子 agent 的工具注册表：继承所有工具，去掉自己
    sub_registry = ToolRegistry()
    for tool_name in registry._tools:
        if tool_name != "sub_agent":
            sub_registry.register(registry._tools[tool_name])

    max_turns = min(max_turns, MAX_TURNS)  # 最大轮次 = 20

    # Sub-agent 拥有独立的 messages 列表
    messages: list[dict] = [{"role": "user", "content": task}]
    last_response = ""

    for turn in range(max_turns):
        # 用 sub-agent 自己的 messages 调用 API
        async for chunk in stream_response(
            api_key=api_key, model=model,
            system=sub_system, messages=messages,
            tools=sub_registry.get_api_schemas() or None,
        ):
            # ... 收集 text + tool_calls

        messages.append(assistant_msg)

        if finish_reason == "stop":
            break

        # 执行工具调用（串行，简化版）
        if finish_reason == "tool_calls" and tool_calls:
            for tc in tool_calls:
                result = await sub_registry.dispatch(func_name, func_args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })

    return last_response`, annotations: [
              { lines: [1, 3] as [number, number], label: "方法入口", explanation: "接收任务描述和最大轮次，从父级获取工具注册表" },
              { lines: [5, 9] as [number, number], label: "防递归注册", explanation: "继承父 agent 所有工具但排除 sub_agent 自身，防止无限嵌套创建子 agent" },
              { lines: [11, 15] as [number, number], label: "上下文隔离", explanation: "独立的 messages 列表是核心设计 — 子任务的中间过程不污染父 agent 上下文" },
              { lines: [17, 24] as [number, number], label: "Agent Loop", explanation: "子 agent 自己的循环：用独立 messages 调 API，流式收集响应" },
              { lines: [26, 29] as [number, number], label: "终止判断", explanation: "将助手消息追加到 messages，finish_reason=stop 时跳出循环" },
              { lines: [31, 39] as [number, number], label: "工具执行", explanation: "串行执行工具调用（简化版不用并发执行器），结果作为 tool message 追加" },
              { lines: [41, 41] as [number, number], label: "返回结果", explanation: "只返回最后一轮的文本响应给父 agent，所有中间上下文留在子 agent 内部" },
            ] },
        ],
      },
      {
        type: "code",
        title: "源码：configure() — 注入父 agent 依赖 (tools/subagent.py)",
        items: [
          t("Sub-agent 工具在 agent 初始化时接收父级的 registry 和 API 配置", false),
          { text: "", code: `def configure(self, parent_registry: 'ToolRegistry', api_config: dict):
    """Inject parent's registry and API config before the tool is usable.
    Called during agent initialization."""
    self._parent_registry = parent_registry
    self._api_config = api_config`, annotations: [
              { lines: [1, 3] as [number, number], label: "依赖注入", explanation: "agent 初始化时调用，将父级的工具注册表和 API 配置注入 sub-agent 工具" },
              { lines: [4, 5] as [number, number], label: "保存引用", explanation: "保存父级引用供 execute() 使用，sub-agent 通过这些引用继承父级能力" },
            ] },
          t("注意去掉自己的逻辑：if tool_name != \"sub_agent\" — 最简单的递归终止条件", true),
        ],
      },
      {
        type: "insight",
        title: "Sub-Agent 的上下文隔离是关键",
        items: [
          t("独立的 messages list 意味着不会污染父 agent 的上下文", true),
          t("Sub-agent 执行 20 轮工具调用产生的中间过程不会进入父 agent 的 messages — 只有最终结果回传"),
          t("这解决了一个实际问题：复杂子任务（如搜索代码库所有用法）会产生大量中间上下文，如果在父 agent 里执行会快速耗尽上下文窗口"),
          t("max_turns = 20 是第二道保险 — 即使模型陷入循环，最多 20 轮就强制停止"),
        ],
      },
      {
        type: "teacher",
        title: "老师补充：生态系统的整体视角",
        items: [
          t("环境信息 → system prompt 注入：模型知道自己跑在什么环境，减少试错（比如不会在 macOS 上用 apt-get）", true),
          t("Hooks → 扩展点：不改 agent 代码就能添加审计、过滤、通知等功能"),
          t("Sub-Agent → 隔离执行：复杂子任务不污染父上下文，是 agent 可组合性的基础"),
          t("这三者构成了 agent 的「基础设施层」— 不是核心 loop，但没有它们 agent 在生产环境寸步难行"),
        ],
      },
    ],
    questions: [
      {
        id: "l08-q1",
        question: "为什么环境信息要分静态和动态两部分？",
        answer: "静态信息（OS、Shell、Python 版本）几乎不变，缓存到磁盘避免重复收集。动态信息（CWD、Git branch）每次启动都可能不同，必须实时获取。如果全部缓存，用户 cd 到新目录后 agent 还以为在旧目录。如果全部实时获取，每次启动多跑几个 subprocess，浪费几十毫秒。分离后两全其美。",
        hint: "想想用户 cd 到另一个项目后重启 agent 会怎样",
      },
      {
        id: "l08-q2",
        question: "Sub-Agent 为什么要从 registry 里去掉自己？",
        answer: "防止递归创建。如果 sub-agent 工具列表里还有 sub-agent，模型可能无限嵌套创建 sub-agent → sub-sub-agent → ...。去掉自己是最简单的递归终止条件（if tool_name != \"sub_agent\"）。max_turns 是第二道保险 — 即使通过其他方式触发了递归，20 轮后也会强制停止。",
        hint: "想想如果 sub-agent 还能创建 sub-agent 会发生什么",
      },
    ],
  },
];
