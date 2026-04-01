import { NextRequest } from "next/server";

const API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "gpt-4o";
const BASE_URL =
  process.env.LLM_BASE_URL || "https://api.openai.com/v1/chat/completions";

export async function POST(req: NextRequest) {
  if (!API_KEY) {
    return new Response("OPENAI_API_KEY not configured", { status: 500 });
  }

  const { userAnswer, referenceAnswer, questionId } = await req.json();

  if (!userAnswer?.trim()) {
    return new Response("Empty answer", { status: 400 });
  }

  const systemPrompt = `你是一位 Agent 开发课程的助教。学员回答了一道关于 AI Agent 架构的思考题。
请评价学员的回答，用中文回复，格式如下：
1. 先给出整体评价（一句话）
2. 优点：学员答对了什么
3. 不足：学员遗漏或理解不准确的地方
4. 补充：参考答案中值得注意的要点
保持友好、鼓励的语气，控制在 200 字以内。`;

  const userPrompt = `思考题 ID: ${questionId}

学员的回答：
${userAnswer}

参考答案：
${referenceAnswer}`;

  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(`LLM API error: ${text}`, { status: 502 });
  }

  // Stream SSE back to client as plain text
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch {
              // skip malformed
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
