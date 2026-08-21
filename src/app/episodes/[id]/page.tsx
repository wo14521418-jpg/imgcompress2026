import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { GenerateScriptButton } from '@/components/generate-script-button'

export const dynamic = 'force-dynamic'

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      project: true,
      characters: true,
      scenes: true,
      shots: { orderBy: { index: 'asc' } },
    },
  })
  if (!episode) notFound()

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href={`/projects/${episode.projectId}`}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← 返回 {episode.project.title}
        </Link>

        <header className="mb-8 mt-6">
          <h1 className="text-2xl font-semibold tracking-tight">{episode.title}</h1>
          <p className="mt-2 text-sm text-neutral-500">状态：{episode.status}</p>
        </header>

        <GenerateScriptButton episodeId={episode.id} />

        <Section title={`角色（${episode.characters.length}）`} empty="生成剧本后显示角色">
          {episode.characters.map((c) => (
            <li key={c.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
              <p className="font-medium">{c.name}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{c.description}</p>
            </li>
          ))}
        </Section>

        <Section title={`场景（${episode.scenes.length}）`} empty="生成剧本后显示场景">
          {episode.scenes.map((s) => (
            <li key={s.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
              <p className="font-medium">{s.name}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{s.description}</p>
            </li>
          ))}
        </Section>

        <section className="mt-10">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-400">
            镜头（{episode.shots.length}）
          </h2>
          {episode.shots.length === 0 ? (
            <p className="text-sm text-neutral-400">生成剧本后显示分镜。</p>
          ) : (
            <ul className="space-y-2">
              {episode.shots.map((s) => (
                <li key={s.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-400">镜 {s.index + 1}</span>
                    <span className="text-xs text-neutral-400">
                      {s.cameraMove ? `运镜：${s.cameraMove}` : ''}
                      {s.durationSec ? ` · ${s.durationSec}s` : ''}
                    </span>
                  </div>
                  <p className="mt-1">{s.description}</p>
                  {s.dialogue && (
                    <p className="mt-1 text-xs text-neutral-500">台词：{s.dialogue}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

function Section({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode
}) {
  const items = Array.isArray(children) ? children : [children]
  const isEmpty = items.filter(Boolean).length === 0
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-400">{title}</h2>
      {isEmpty ? <p className="text-sm text-neutral-400">{empty}</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  )
}
