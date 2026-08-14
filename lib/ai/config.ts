/**
 * DeepSeek / 对话模型配置
 *
 * 改参数优先看这里；密钥放 `.env.local`（见仓库根目录 `.env.example`）。
 *
 * 环境变量（可选，覆盖下方默认值）：
 * - DEEPSEEK_API_KEY          必填
 * - DEEPSEEK_BASE_URL         默认 https://api.deepseek.com
 * - DEEPSEEK_MODEL            默认 deepseek-v4-pro
 * - DEEPSEEK_THINKING         enabled | disabled
 * - DEEPSEEK_REASONING_EFFORT low | high | max
 */

export type ReasoningEffort = "low" | "high" | "max";
export type ThinkingMode = "enabled" | "disabled";

function env(name: string, fallback?: string) {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

export const deepseekConfig = {
  /** API Key：只从环境变量读取，不要写进代码 */
  get apiKey() {
    return env("DEEPSEEK_API_KEY");
  },

  baseURL: env("DEEPSEEK_BASE_URL", "https://api.deepseek.com")!,

  /** deepseek-v4-pro | deepseek-v4-flash */
  model: env("DEEPSEEK_MODEL", "deepseek-v4-pro")!,

  /** 思考模式开关 */
  thinking: (env("DEEPSEEK_THINKING", "enabled") as ThinkingMode) ?? "enabled",

  /** 思考强度：low / high / max */
  reasoningEffort: (env("DEEPSEEK_REASONING_EFFORT", "high") as ReasoningEffort) ?? "high",

  /** 系统提示词（可直接改这段） */
  systemPrompt: [
    "你是英语学习助手，帮助用户理解 PDF 阅读中的单词、句子和用法。",
    "回答简洁、准确，必要时给中文释义和英文例句。",
    "若用户提供了选中文本，请优先围绕该文本解释。",
  ].join("\n"),
} as const;
