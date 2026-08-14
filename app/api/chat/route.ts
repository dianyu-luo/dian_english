import { deepseekConfig } from "@/lib/ai/config";
import {
  createDeepseekChatStream,
  readStreamDelta,
  type ChatTurn,
} from "@/lib/ai/deepseek";

export const runtime = "nodejs";

type IncomingMessage = {
  role?: string;
  content?: string;
};

type ChatBody = {
  messages?: IncomingMessage[];
  selection?: {
    word?: string;
    type?: string;
    fileName?: string;
    pageNumber?: number;
    contextBefore?: string;
    contextAfter?: string;
  } | null;
};

function buildSystemPrompt(selection: ChatBody["selection"]): string {
  const parts = [deepseekConfig.systemPrompt];

  if (selection?.word?.trim()) {
    parts.push(
      "",
      "【当前选区上下文】",
      `类型：${selection.type === "sentence" ? "句子" : "单词"}`,
      `文本：${selection.word.trim()}`,
    );
    if (selection.fileName) parts.push(`文件：${selection.fileName}`);
    if (selection.pageNumber != null) parts.push(`页码：第 ${selection.pageNumber} 页`);
    if (selection.contextBefore) parts.push(`前文：${selection.contextBefore}`);
    if (selection.contextAfter) parts.push(`后文：${selection.contextAfter}`);
  }

  return parts.join("\n");
}

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  if (!deepseekConfig.apiKey) {
    return Response.json(
      { ok: false, error: "未配置 DEEPSEEK_API_KEY。请在项目根目录创建 .env.local 并填写密钥。" },
      { status: 500 },
    );
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const history: ChatTurn[] = incoming
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .slice(-20);

  if (history.length === 0) {
    return Response.json({ ok: false, error: "messages 不能为空" }, { status: 400 });
  }

  const messages: ChatTurn[] = [
    { role: "system", content: buildSystemPrompt(body.selection ?? null) },
    ...history,
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (payload: unknown) => {
        controller.enqueue(encoder.encode(sse(payload)));
      };

      try {
        push({ type: "start", model: deepseekConfig.model });
        const completion = await createDeepseekChatStream({ messages });

        for await (const chunk of completion) {
          if (request.signal.aborted) break;
          const { content, reasoning } = readStreamDelta(chunk);
          if (reasoning) push({ type: "reasoning", delta: reasoning });
          if (content) push({ type: "delta", delta: content });
        }

        push({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "调用模型失败";
        push({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
