import Link from "next/link";

export default function Home() {
  const pages = [
    { title: "学习模式", description: "开始你的英语学习之旅", href: "/learning", icon: "📚", color: "from-blue-500 to-cyan-500" },
    { title: "练习中心", description: "巩固已学知识", href: "/practice", icon: "✏️", color: "from-purple-500 to-pink-500" },
    { title: "进度追踪", description: "查看你的学习进度", href: "/progress", icon: "📊", color: "from-green-500 to-emerald-500" },
    { title: "设置", description: "个性化你的学习体验", href: "/settings", icon: "⚙️", color: "from-orange-500 to-red-500" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <main className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <h1 className="text-6xl font-bold text-white mb-4 tracking-tight">
            Dian English
          </h1>
          <p className="text-xl text-slate-300">
            让英语学习变得简单而有趣
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {pages.map((page, index) => (
            <Link
              key={page.href}
              href={page.href}
              className="group relative overflow-hidden rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-8 transition-all duration-300 hover:scale-105 hover:bg-white/20 hover:shadow-2xl"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${page.color} opacity-0 group-hover:opacity-20 transition-opacity duration-300`}></div>
              
              <div className="relative z-10">
                <div className="text-5xl mb-4">{page.icon}</div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {page.title}
                </h2>
                <p className="text-slate-300">
                  {page.description}
                </p>
              </div>
              
              <div className="absolute bottom-4 right-4 text-white/50 group-hover:text-white/100 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-slate-400">
          <p>开始你的英语学习之旅 🚀</p>
        </div>
      </main>
    </div>
  );
}
