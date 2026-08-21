import { prisma } from '@/lib/db'
import { createProject } from './actions'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-xl px-6 py-16">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">AI 漫剧生成</h1>
          <p className="mt-2 text-sm text-neutral-500">
            输入一个题材，开始创作动态漫画。
          </p>
        </header>

        <form action={createProject} className="mb-12 flex gap-2">
          <input
            name="premise"
            placeholder="例如：都市逆袭、仙侠虐恋、悬疑复仇……"
            required
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200"
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
          >
            保存
          </button>
        </form>

        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-400">
            已保存的题材（{projects.length}）
          </h2>
          {projects.length === 0 ? (
            <p className="text-sm text-neutral-400">还没有题材，先输入一个吧。</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm"
                >
                  <p>{p.premise}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {new Date(p.createdAt).toLocaleString('zh-CN')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
