import Link from "next/link";

export default function Progress() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 dark:from-slate-900 dark:to-slate-800">
      <main className="container mx-auto px-4 py-16">
        <Link 
          href="/" 
          className="inline-flex items-center text-green-600 hover:text-green-800 mb-8"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回首页
        </Link>

        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">
            📊 进度追踪
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            查看你的学习进度和成就
          </p>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
              学习统计
            </h2>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700 dark:text-gray-300">单词掌握</span>
                  <span className="text-gray-700 dark:text-gray-300">0/1000</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-green-500 h-3 rounded-full" style={{ width: '0%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700 dark:text-gray-300">学习天数</span>
                  <span className="text-gray-700 dark:text-gray-300">0 天</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700 dark:text-gray-300">总学习时长</span>
                  <span className="text-gray-700 dark:text-gray-300">0 小时</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
