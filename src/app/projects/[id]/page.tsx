import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { createEpisode } from '@/app/actions'

export const dynamic = 'force-dynamic'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id },
    include: { episodes: { orderBy: { index: 'asc' } } },
  })
  if (!project) notFound()

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← 返回项目列表
        </Link>

        <header className="mb-10 mt-6">
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <p className="mt-2 text-sm text-neutral-500">{project.premise}</p>
        </header>

        <form action={createEpisode.bind(null, project.id)} className="mb-12 flex gap-2">
          <input
            name="title"
            placeholder="集标题，例如：第一集"
            required
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200"
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
          >
            新建集
          </button>
        </form>

        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-400">
            剧集（{project.episodes.length}）
          </h2>
          {project.episodes.length === 0 ? (
            <p className="text-sm text-neutral-400">还没有剧集，先新建一集吧。</p>
          ) : (
            <ul className="space-y-2">
              {project.episodes.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/episodes/${e.id}`}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm transition-colors hover:border-neutral-400"
                  >
                    <div>
                      <p className="font-medium">{e.title}</p>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        第 {e.index + 1} 集 · {e.status}
                      </p>
                    </div>
                    <span className="text-xs text-neutral-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
