import { deepseekConfig, glmConfig } from "@/lib/ai/config";
import {
  createDeepseekChatStream,
  readStreamDelta,
  type ChatTurn,
} from "@/lib/ai/deepseek";
import { createGlmVisionStream, type GlmTurn } from "@/lib/ai/glm";

export const runtime = "nodejs";
export const maxDuration = 60;

type IncomingMessage = {
  role?: string;
  content?: string;
};

type ChatBody = {
  messages?: IncomingMessage[];
  images?: string[];
  selection?: {
    word?: string;
    type?: string;
    fileName?: string;
    pageNumber?: number;
    contextBefore?: string;
    contextAfter?: string;
  } | null;
};

const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 2_800_000;

function buildSystemPrompt(selection: ChatBody["selection"], vision: boolean): string {
  const parts = [vision ? glmConfig.systemPrompt : deepseekConfig.systemPrompt];

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

function normalizeImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const images: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (!url.startsWith("data:image/")) {
      throw new Error("图片必须是 data:image 格式");
    }
    if (url.length > MAX_IMAGE_CHARS) {
      throw new Error("单张图片过大，请压缩后再试");
    }
    images.push(url);
    if (images.length >= MAX_IMAGES) break;
  }
  return images;
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
  }

  let images: string[] = [];
  try {
    images = normalizeImages(body.images);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "图片无效" },
      { status: 400 },
    );
  }

  const vision = images.length > 0;

  if (vision && !glmConfig.apiKey) {
    return Response.json(
      { ok: false, error: "未配置 ZHIPU_API_KEY。图片 OCR 使用 GLM-4.6V-Flash，请在 .env.local 填写密钥。" },
      { status: 500 },
    );
  }
  if (!vision && !deepseekConfig.apiKey) {
    return Response.json(
      { ok: false, error: "未配置 DEEPSEEK_API_KEY。请在项目根目录创建 .env.local 并填写密钥。" },
      { status: 500 },
    );
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const history: ChatTurn[] = incoming
    .filter((m): m is { role: "user" | "assistant"; content: string } => {
      if (m.role !== "user" && m.role !== "assistant") return false;
      if (typeof m.content !== "string") return false;
      return m.content.trim().length > 0;
    })
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .slice(-20);

  const lastIncoming = incoming.at(-1);
  const lastUserText =
    lastIncoming?.role === "user" && typeof lastIncoming.content === "string"
      ? lastIncoming.content.trim()
      : "";

  if (!vision && history.length === 0) {
    return Response.json({ ok: false, error: "messages 不能为空" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (payload: unknown) => {
        controller.enqueue(encoder.encode(sse(payload)));
      };

      try {
        const model = vision ? glmConfig.model : deepseekConfig.model;
        push({ type: "start", model });

        const completion = vision
          ? await createGlmVisionStream({
              messages: buildVisionMessages({
                history,
                lastUserText,
                images,
                selection: body.selection ?? null,
              }),
            })
          : await createDeepseekChatStream({
              messages: [
                { role: "system", content: buildSystemPrompt(body.selection ?? null, false) },
                ...history,
              ],
            });

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

function buildVisionMessages({
  history,
  lastUserText,
  images,
  selection,
}: {
  history: ChatTurn[];
  lastUserText: string;
  images: string[];
  selection: ChatBody["selection"];
}): GlmTurn[] {
  const text = lastUserText || glmConfig.defaultUserPrompt;
  const last = history.at(-1);
  const prior =
    last?.role === "user" && last.content === lastUserText ? history.slice(0, -1) : history;

  return [
    { role: "system", content: buildSystemPrompt(selection, true) },
    ...prior,
    {
      role: "user",
      content: [
        ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        { type: "text" as const, text },
      ],
    },
  ];
}
