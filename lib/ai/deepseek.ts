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

type DeepseekMessage = {
  content?: string | null;
  reasoning_content?: string;
};

/** 非流式对话；参数集中在 lib/ai/config.ts */
export async function createDeepseekChat({ messages }: CreateChatOptions) {
  const openai = getDeepseekClient();

  // DeepSeek 扩展字段 thinking 不在 OpenAI 官方类型里，整包断言一次
  const completion = await openai.chat.completions.create({
    model: deepseekConfig.model,
    messages,
    stream: false,
    reasoning_effort: deepseekConfig.reasoningEffort,
    thinking: { type: deepseekConfig.thinking },
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

  const message = completion.choices[0]?.message as DeepseekMessage | undefined;
  return {
    content: message?.content?.trim() ?? "",
    reasoning: message?.reasoning_content,
    raw: completion,
  };
}
