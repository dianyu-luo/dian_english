import Link from "next/link";

export default function Settings() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 dark:from-slate-900 dark:to-slate-800">
      <main className="container mx-auto px-4 py-16">
        <Link 
          href="/" 
          className="inline-flex items-center text-orange-600 hover:text-orange-800 mb-8"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回首页
        </Link>

        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">
            ⚙️ 设置
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            个性化你的学习体验
          </p>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
              偏好设置
            </h2>
            <ul className="space-y-4">
              <li className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300">语言</span>
                <span className="text-gray-500 dark:text-gray-400">简体中文</span>
              </li>
              <li className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300">主题</span>
                <span className="text-gray-500 dark:text-gray-400">跟随系统</span>
              </li>
              <li className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300">每日目标</span>
                <span className="text-gray-500 dark:text-gray-400">10 个单词</span>
              </li>
              <li className="flex items-center justify-between py-3">
                <span className="text-gray-700 dark:text-gray-300">通知提醒</span>
                <span className="text-gray-500 dark:text-gray-400">开启</span>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
