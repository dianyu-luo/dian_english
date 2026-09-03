import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "设置",
  description: "系统设置",
};

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-[#d6d3d1] pt-8">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">{title}</h2>
        {description ? (
          <p className="text-sm leading-6 text-[#78716c]">{description}</p>
        ) : null}
      </div>
      <div className="divide-y divide-[#e7e2d9] border-y border-[#e7e2d9]">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center sm:gap-6">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-[#1c1917]">{label}</p>
        {hint ? <p className="text-xs leading-5 text-[#a8a29e]">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs ${
        ok
          ? "border-[#86efac] bg-[#f0fdf4] text-[#166534]"
          : "border-[#d6d3d1] bg-[#faf8f4] text-[#78716c]"
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? "bg-[#22c55e]" : "bg-[#a8a29e]"}`}
        aria-hidden
      />
      {label}
    </span>
  );
}

const fieldClass =
  "w-full max-w-md border border-[#d6d3d1] bg-[#faf8f4] px-3 py-1.5 text-sm text-[#57534e] disabled:cursor-not-allowed disabled:opacity-70";

const btnClass =
  "border border-[#d6d3d1] bg-[#faf8f4] px-3 py-1.5 text-sm text-[#57534e] disabled:cursor-not-allowed disabled:opacity-60";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#1c1917]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">设置</h1>
          <p className="max-w-2xl text-base leading-7 text-[#57534e]">
            根据当前项目功能整理的配置界面。以下选项仅作展示，修改不会生效；实际配置见{" "}
            <code className="text-sm text-[#78716c]">.env.local</code> 与 PDF
            阅读器内的本地偏好。
          </p>
        </section>

        <SettingSection
          title="API"
          description="AI 密钥通过服务端环境变量配置。"
        >
          <SettingRow label="DeepSeek API" hint="文本对话 · DEEPSEEK_API_KEY">
            <StatusBadge ok label="通过 .env.local 配置" />
          </SettingRow>
          <SettingRow label="智谱 GLM API" hint="图片 OCR / 公式 · ZHIPU_API_KEY">
            <StatusBadge ok label="通过 .env.local 配置" />
          </SettingRow>
        </SettingSection>

        <SettingSection
          title="AI 助手"
          description="对应 lib/ai/config.ts 与 /api/chat，当前默认值如下。"
        >
          <SettingRow label="文本对话模型" hint="DEEPSEEK_MODEL">
            <select disabled defaultValue="deepseek-v4-pro" className={fieldClass}>
              <option value="deepseek-v4-pro">deepseek-v4-pro</option>
              <option value="deepseek-v4-flash">deepseek-v4-flash</option>
            </select>
          </SettingRow>
          <SettingRow label="思考模式" hint="DEEPSEEK_THINKING">
            <select disabled defaultValue="enabled" className={fieldClass}>
              <option value="enabled">开启</option>
              <option value="disabled">关闭</option>
            </select>
          </SettingRow>
          <SettingRow label="思考强度" hint="DEEPSEEK_REASONING_EFFORT">
            <select disabled defaultValue="high" className={fieldClass}>
              <option value="low">低</option>
              <option value="high">高</option>
              <option value="max">最高</option>
            </select>
          </SettingRow>
          <SettingRow label="视觉 / OCR 模型" hint="GLM_VISION_MODEL">
            <select disabled defaultValue="glm-4.6v-flash" className={fieldClass}>
              <option value="glm-4.6v-flash">glm-4.6v-flash</option>
            </select>
          </SettingRow>
          <SettingRow label="GLM 思考模式" hint="GLM_THINKING">
            <select disabled defaultValue="disabled" className={fieldClass}>
              <option value="enabled">开启</option>
              <option value="disabled">关闭</option>
            </select>
          </SettingRow>
          <SettingRow label="对话历史上限" hint="每次请求保留最近 N 条">
            <input disabled type="number" defaultValue={20} className={`${fieldClass} max-w-[8rem]`} />
          </SettingRow>
          <SettingRow label="快捷提问" hint="PDF 侧边栏选中文本后可用">
            <div className="flex flex-wrap gap-1.5">
              {["解释含义", "用法例句", "同义词", "笔记"].map((label) => (
                <span
                  key={label}
                  className="border border-[#d6d3d1] bg-white px-2 py-0.5 text-xs text-[#57534e]"
                >
                  {label}
                </span>
              ))}
            </div>
          </SettingRow>
          <SettingRow label="文本助手提示词" hint="deepseekConfig.systemPrompt">
            <textarea
              disabled
              rows={3}
              defaultValue={
                "你是英语学习助手，帮助用户理解 PDF 阅读中的单词、句子和用法。\n回答简洁、准确，必要时给中文释义和英文例句。\n若用户提供了选中文本，请优先围绕该文本解释。"
              }
              className={`${fieldClass} max-w-xl resize-none`}
            />
          </SettingRow>
        </SettingSection>

        <SettingSection
          title="PDF 阅读"
          description="阅读器偏好，部分保存在浏览器 localStorage，缩放与页码按文件存入数据库。"
        >
          <SettingRow label="默认阅读模式" hint="pdf-view-mode">
            <select disabled defaultValue="paged" className={fieldClass}>
              <option value="paged">单页</option>
              <option value="continuous">连续</option>
            </select>
          </SettingRow>
          <SettingRow label="默认缩放" hint="新文件初始比例，范围 0.5–2.5">
            <input
              disabled
              type="number"
              defaultValue={1}
              step={0.1}
              min={0.5}
              max={2.5}
              className={`${fieldClass} max-w-[8rem]`}
            />
          </SettingRow>
          <SettingRow label="侧边对话栏宽度" hint="ne-chat-side-width">
            <div className="flex items-center gap-2">
              <input
                disabled
                type="number"
                defaultValue={380}
                className={`${fieldClass} max-w-[8rem]`}
              />
              <span className="text-sm text-[#78716c]">px</span>
            </div>
          </SettingRow>
          <SettingRow label="选中后自动复制" hint="选中文本时写入剪贴板">
            <label className="inline-flex items-center gap-2 text-sm text-[#57534e]">
              <input disabled type="checkbox" defaultChecked className="accent-[#57534e]" />
              开启（当前固定开启）
            </label>
          </SettingRow>
          <SettingRow label="英文单词自动入库" hint="选中英文单词时写入 pdf_word_marks">
            <label className="inline-flex items-center gap-2 text-sm text-[#57534e]">
              <input disabled type="checkbox" defaultChecked className="accent-[#57534e]" />
              开启（当前固定开启）
            </label>
          </SettingRow>
          <SettingRow label="恢复上次阅读" hint="打开 /pdf 时加载最近文件">
            <label className="inline-flex items-center gap-2 text-sm text-[#57534e]">
              <input disabled type="checkbox" defaultChecked className="accent-[#57534e]" />
              开启
            </label>
          </SettingRow>
        </SettingSection>

        <SettingSection
          title="笔记与标注"
          description="Markdown 笔记、页内标记与手绘标注相关默认值。"
        >
          <SettingRow label="笔记编辑器字号" hint="pdf-note-font-size · 12–48">
            <div className="flex items-center gap-2">
              <input
                disabled
                type="number"
                defaultValue={14}
                min={12}
                max={48}
                step={2}
                className={`${fieldClass} max-w-[8rem]`}
              />
              <span className="text-sm text-[#78716c]">px</span>
            </div>
          </SettingRow>
          <SettingRow label="笔记自动保存间隔" hint="编辑器 debounce">
            <div className="flex items-center gap-2">
              <input
                disabled
                type="number"
                defaultValue={600}
                className={`${fieldClass} max-w-[8rem]`}
              />
              <span className="text-sm text-[#78716c]">ms</span>
            </div>
          </SettingRow>
          <SettingRow label="默认标注工具" hint="pdf-last-annotate-tool">
            <select disabled defaultValue="arrow" className={fieldClass}>
              <option value="arrow">箭头</option>
              <option value="circle">圆形</option>
              <option value="rect">矩形</option>
            </select>
          </SettingRow>
          <SettingRow label="标注默认颜色">
            <div className="flex items-center gap-2">
              <input
                disabled
                type="color"
                defaultValue="#dc2626"
                className="h-8 w-12 cursor-not-allowed border border-[#d6d3d1] bg-[#faf8f4] disabled:opacity-70"
              />
              <span className="text-sm text-[#78716c]">#dc2626</span>
            </div>
          </SettingRow>
          <SettingRow label="标注线宽" hint="箭头 2.5 · 数据库默认 2">
            <input
              disabled
              type="number"
              defaultValue={2.5}
              step={0.5}
              className={`${fieldClass} max-w-[8rem]`}
            />
          </SettingRow>
          <SettingRow label="页内标记类型" hint="右键菜单可创建">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "笔记", color: "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]" },
                { label: "问题", color: "border-[#fcd34d] bg-[#fffbeb] text-[#b45309]" },
                { label: "书签", color: "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]" },
                { label: "待办", color: "border-[#5eead4] bg-[#f0fdfa] text-[#0f766e]" },
              ].map(({ label, color }) => (
                <span key={label} className={`border px-2 py-0.5 text-xs ${color}`}>
                  {label}
                </span>
              ))}
            </div>
          </SettingRow>
        </SettingSection>

        <SettingSection
          title="学习时长统计"
          description="对应 /activity 与 page_dwell_sessions，在 PDF 阅读时自动采集。"
        >
          <SettingRow label="启用统计" hint="usePageDwell">
            <label className="inline-flex items-center gap-2 text-sm text-[#57534e]">
              <input disabled type="checkbox" defaultChecked className="accent-[#57534e]" />
              开启
            </label>
          </SettingRow>
          <SettingRow label="空闲超时" hint="DWELL_IDLE_MS · 无操作停止计时">
            <div className="flex items-center gap-2">
              <input
                disabled
                type="number"
                defaultValue={5}
                className={`${fieldClass} max-w-[8rem]`}
              />
              <span className="text-sm text-[#78716c]">分钟</span>
            </div>
          </SettingRow>
          <SettingRow label="失焦合并窗口" hint="DWELL_FOCUS_GAP_MS · 短失焦仍算同一段">
            <div className="flex items-center gap-2">
              <input
                disabled
                type="number"
                defaultValue={3}
                className={`${fieldClass} max-w-[8rem]`}
              />
              <span className="text-sm text-[#78716c]">分钟</span>
            </div>
          </SettingRow>
          <SettingRow label="本周起始日" hint="活动页「本周使用时长」">
            <select disabled defaultValue="monday" className={fieldClass}>
              <option value="monday">周一</option>
            </select>
          </SettingRow>
        </SettingSection>

        <SettingSection
          title="数据管理"
          description="删除操作在 PDF 工具栏「最近打开」中可用。"
        >
          <SettingRow label="最近打开的文件" hint="可在 PDF 阅读器工具栏管理">
            <Link
              href="/pdf"
              className="text-sm text-[#57534e] underline decoration-[#d6d3d1] underline-offset-2 hover:text-[#1c1917]"
            >
              前往 PDF 阅读器 →
            </Link>
          </SettingRow>
          <SettingRow label="学习数据" hint="时长、笔记、标记、标注">
            <Link
              href="/activity"
              className="text-sm text-[#57534e] underline decoration-[#d6d3d1] underline-offset-2 hover:text-[#1c1917]"
            >
              前往浏览数据 →
            </Link>
          </SettingRow>
          <SettingRow label="导出 / 备份">
            <button type="button" disabled className={btnClass}>
              导出学习数据
            </button>
          </SettingRow>
          <SettingRow label="清除活动记录">
            <button type="button" disabled className={btnClass}>
              清除学习时长记录
            </button>
          </SettingRow>
          <SettingRow label="清除全部 PDF 数据">
            <button type="button" disabled className={`${btnClass} text-[#b91c1c]`}>
              清除全部 PDF 与标注
            </button>
          </SettingRow>
        </SettingSection>

        <div className="mt-10 flex items-center justify-end gap-3 border-t border-[#d6d3d1] pt-8">
          <p className="mr-auto text-sm text-[#a8a29e]">当前为展示模式，保存不会生效</p>
          <button type="button" disabled className={`${btnClass} px-4 font-medium text-[#1c1917]`}>
            保存修改内容
          </button>
        </div>
      </main>
    </div>
  );
}
