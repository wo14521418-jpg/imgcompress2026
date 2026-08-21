import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { GenerateButton } from '@/components/generate-button'

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

        <header className="mb-6 mt-6">
          <h1 className="text-2xl font-semibold tracking-tight">{episode.title}</h1>
          <p className="mt-2 text-sm text-neutral-500">状态：{episode.status}</p>
        </header>

        <div className="mb-12 flex flex-wrap gap-4">
          <GenerateButton label="生成剧本" endpoint={`/api/episodes/${episode.id}/generate`} />
          <GenerateButton label="生成资产图" endpoint={`/api/episodes/${episode.id}/assets`} />
          <GenerateButton label="生成关键帧" endpoint={`/api/episodes/${episode.id}/keyframes`} />
        </div>

        <section className="mt-10">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-400">
            角色（{episode.characters.length}）
          </h2>
          {episode.characters.length === 0 ? (
            <p className="text-sm text-neutral-400">生成剧本后显示角色。</p>
          ) : (
            <ul className="space-y-2">
              {episode.characters.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-4 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm"
                >
                  {c.refImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.refImageUrl}
                      alt={c.name}
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{c.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-400">
            场景（{episode.scenes.length}）
          </h2>
          {episode.scenes.length === 0 ? (
            <p className="text-sm text-neutral-400">生成剧本后显示场景。</p>
          ) : (
            <ul className="space-y-2">
              {episode.scenes.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-4 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm"
                >
                  {s.refImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.refImageUrl}
                      alt={s.name}
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{s.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-400">
            镜头（{episode.shots.length}）
          </h2>
          {episode.shots.length === 0 ? (
            <p className="text-sm text-neutral-400">生成剧本后显示分镜。</p>
          ) : (
            <ul className="space-y-2">
              {episode.shots.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm"
                >
                  {s.keyframeUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.keyframeUrl}
                      alt={`镜 ${s.index + 1}`}
                      className="mb-2 h-40 w-full rounded-lg object-cover"
                    />
                  )}
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
