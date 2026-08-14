import { NextResponse } from "next/server";
import { deepseekConfig } from "@/lib/ai/config";
import { createDeepseekChat, type ChatTurn } from "@/lib/ai/deepseek";

type IncomingMessage = {
  role?: string;
  content?: string;
};

type ChatBody = {
  messages?: IncomingMessage[];
  /** 当前 PDF 选区（可选） */
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

export async function POST(request: Request) {
  if (!deepseekConfig.apiKey) {
    return NextResponse.json(
      { ok: false, error: "未配置 DEEPSEEK_API_KEY。请在项目根目录创建 .env.local 并填写密钥。" },
      { status: 500 },
    );
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是 JSON" }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: "messages 不能为空" }, { status: 400 });
  }

  const messages: ChatTurn[] = [
    { role: "system", content: buildSystemPrompt(body.selection ?? null) },
    ...history,
  ];

  try {
    const result = await createDeepseekChat({ messages });
    if (!result.content) {
      return NextResponse.json({ ok: false, error: "模型未返回内容" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      content: result.content,
      model: deepseekConfig.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "调用模型失败";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
