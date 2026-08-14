import OpenAI from "openai";
import { deepseekConfig } from "./config";

let client: OpenAI | null = null;

export function getDeepseekClient() {
  const apiKey = deepseekConfig.apiKey;
  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置");
  }
  if (!client) {
    client = new OpenAI({
      baseURL: deepseekConfig.baseURL,
      apiKey,
    });
  }
  return client;
}

export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CreateChatOptions = {
  messages: ChatTurn[];
};

type StreamDelta = {
  content?: string | null;
  reasoning_content?: string | null;
};

/** 流式对话；参数集中在 lib/ai/config.ts */
export async function createDeepseekChatStream({ messages }: CreateChatOptions) {
  const openai = getDeepseekClient();

  return openai.chat.completions.create({
    model: deepseekConfig.model,
    messages,
    stream: true,
    reasoning_effort: deepseekConfig.reasoningEffort,
    thinking: { type: deepseekConfig.thinking },
  } as OpenAI.Chat.ChatCompletionCreateParamsStreaming);
}

/** 从 DeepSeek/OpenAI chunk 里取出正文与推理增量 */
export function readStreamDelta(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): {
  content: string;
  reasoning: string;
} {
  const delta = chunk.choices[0]?.delta as StreamDelta | undefined;
  return {
    content: typeof delta?.content === "string" ? delta.content : "",
    reasoning: typeof delta?.reasoning_content === "string" ? delta.reasoning_content : "",
  };
}
