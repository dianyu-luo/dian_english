import OpenAI from "openai";
import { glmConfig } from "./config";

let client: OpenAI | null = null;

export function getGlmClient() {
  const apiKey = glmConfig.apiKey;
  if (!apiKey) {
    throw new Error("缺少 ZHIPU_API_KEY，请在 .env.local 中配置");
  }
  if (!client) {
    client = new OpenAI({
      baseURL: glmConfig.baseURL,
      apiKey,
    });
  }
  return client;
}

export type GlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type GlmTurn = {
  role: "system" | "user" | "assistant";
  content: string | GlmContentPart[];
};

type CreateVisionOptions = {
  messages: GlmTurn[];
};

/** GLM-4.6V 视觉流式对话；参数集中在 lib/ai/config.ts */
export async function createGlmVisionStream({ messages }: CreateVisionOptions) {
  const openai = getGlmClient();

  return openai.chat.completions.create({
    model: glmConfig.model,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    stream: true,
    thinking: { type: glmConfig.thinking },
  } as OpenAI.Chat.ChatCompletionCreateParamsStreaming);
}
