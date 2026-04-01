export async function evaluateAnswer(
  lessonId: string,
  questionId: string,
  userAnswer: string,
  referenceAnswer: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const response = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId, questionId, userAnswer, referenceAnswer }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || "Evaluation failed");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    onChunk(text);
  }
}
