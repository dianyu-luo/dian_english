import Link from "next/link";

export default function Learning() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800">
      <main className="container mx-auto px-4 py-16">
        <Link 
          href="/" 
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-8"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回首页
        </Link>

        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">
            📚 学习模式
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            在这里开始你的英语学习之旅
          </p>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
              学习内容
            </h2>
            <ul className="space-y-4">
              <li className="flex items-center text-gray-700 dark:text-gray-300">
                <span className="text-2xl mr-4">✓</span>
                <span>单词学习</span>
              </li>
              <li className="flex items-center text-gray-700 dark:text-gray-300">
                <span className="text-2xl mr-4">✓</span>
                <span>语法讲解</span>
              </li>
              <li className="flex items-center text-gray-700 dark:text-gray-300">
                <span className="text-2xl mr-4">✓</span>
                <span>听力训练</span>
              </li>
              <li className="flex items-center text-gray-700 dark:text-gray-300">
                <span className="text-2xl mr-4">✓</span>
                <span>口语练习</span>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
