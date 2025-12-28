
"use client";
import Link from "next/link";
import { Button, ConfigProvider } from "antd";
import zhCN from 'antd/locale/zh_CN';
import "antd/dist/reset.css";
import { useRouter } from 'next/navigation';
export default function Learning() {
  const router = useRouter();
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

          <ConfigProvider locale={zhCN}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
                学习内容
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Button
                  type="primary"
                  size="large"
                  block
                  style={{height: 60, fontSize: 20, borderRadius: 12, boxShadow: '0 2px 8px #1677ff22'}}
                  onClick={() => router.push('/learning/word')}
                >
                  单词学习
                </Button>
                <Button type="default" size="large" block style={{height: 60, fontSize: 20, borderRadius: 12, boxShadow: '0 2px 8px #1677ff22'}}>
                  语法讲解
                </Button>
                <Button type="dashed" size="large" block style={{height: 60, fontSize: 20, borderRadius: 12, boxShadow: '0 2px 8px #1677ff22'}}>
                  听力训练
                </Button>
                <Button type="text" size="large" block style={{height: 60, fontSize: 20, borderRadius: 12, color: '#1677ff', background: '#f0f7ff', boxShadow: '0 2px 8px #1677ff22'}}>
                  口语练习
                </Button>
              </div>
            </div>
          </ConfigProvider>
        </div>
      </main>
    </div>
  );
}
