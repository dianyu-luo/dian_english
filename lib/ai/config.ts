/**
 * DeepSeek / GLM 对话模型配置
 *
 * 改参数优先看这里；密钥放 `.env.local`（见仓库根目录 `.env.example`）。
 *
 * 环境变量（可选，覆盖下方默认值）：
 * - DEEPSEEK_API_KEY          文本对话必填
 * - DEEPSEEK_BASE_URL         默认 https://api.deepseek.com
 * - DEEPSEEK_MODEL            默认 deepseek-v4-pro
 * - DEEPSEEK_THINKING         enabled | disabled
 * - DEEPSEEK_REASONING_EFFORT low | high | max
 * - ZHIPU_API_KEY             图片 OCR 必填（兼容 GLM_API_KEY）
 * - ZHIPU_BASE_URL            默认 https://open.bigmodel.cn/api/paas/v4
 * - GLM_VISION_MODEL          默认 glm-4.6v-flash
 * - GLM_THINKING              enabled | disabled
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

export const glmConfig = {
  get apiKey() {
    return env("ZHIPU_API_KEY") ?? env("GLM_API_KEY");
  },

  baseURL: env("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")!,

  model: env("GLM_VISION_MODEL", "glm-4.6v-flash")!,

  thinking: (env("GLM_THINKING", "disabled") as ThinkingMode) ?? "disabled",

  systemPrompt: [
    "你是学习助手，擅长阅读教材截图、手写笔记和题目图片。",
    "处理图片时必须：",
    "1. 完整 OCR 提取可见文字，保持原有段落、列表与层次。",
    "2. 数学公式一律转成 LaTeX：行内用 $...$，独立公式用 $$...$$。不要用 \\( \\) 或 \\[ \\]，不要把公式只放进代码块。",
    "3. 表格用 Markdown 表格还原。",
    "4. 看不清的内容标为 [?]，不要编造。",
    "若用户没有额外提问，只输出识别结果（Markdown）。若有提问，先给出识别内容，再回答问题。",
  ].join("\n"),

  defaultUserPrompt: "请识别图片中的文字。数学公式转成 LaTeX（行内 $...$，独立公式 $$...$$）。",
} as const;
