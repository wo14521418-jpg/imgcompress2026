import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/db'
import type { RenderShot } from './types'

const CHROME_PATH =
  process.env.REMOTION_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

export async function renderEpisode(
  episodeId: string,
  onProgress?: (p: number) => Promise<void>,
): Promise<{ outputUrl: string }> {
  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { shots: { orderBy: { index: 'asc' } } },
  })

  const shots: RenderShot[] = episode.shots.map((s) => ({
    keyframeUrl: s.keyframeUrl,
    dialogue: s.dialogue,
    durationSec: s.durationSec,
    cameraMove: s.cameraMove,
  }))

  const entryPoint = path.join(process.cwd(), 'src', 'lib', 'render', 'root.tsx')
  const serveUrl = await bundle({ entryPoint })

  const composition = await selectComposition({
    serveUrl,
    id: 'Episode',
    inputProps: { shots },
    browserExecutable: CHROME_PATH,
  })

  const outDir = path.join(process.cwd(), 'public', 'renders')
  fs.mkdirSync(outDir, { recursive: true })
  const outputLocation = path.join(outDir, `episode-${episodeId}.mp4`)

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    inputProps: { shots },
    browserExecutable: CHROME_PATH,
    onProgress: async ({ progress }) => {
      if (onProgress) await onProgress(progress)
    },
  })

  return { outputUrl: `/renders/episode-${episodeId}.mp4` }
}
