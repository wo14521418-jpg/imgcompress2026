import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateScriptWithLLM } from '@/lib/llm/deepseek'
import { generateImage } from '@/lib/image/jimeng'
import { buildCharacterPrompt, buildScenePrompt } from '@/lib/image/prompts'

export async function handleGenerateScript(episodeId: string): Promise<void> {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } })
  const project = await prisma.project.findUniqueOrThrow({ where: { id: episode.projectId } })
  const script = await generateScriptWithLLM(project.premise)

  await prisma.episode.update({
    where: { id: episode.id },
    data: {
      script: script as unknown as Prisma.InputJsonValue,
      title: script.title,
      status: 'scripted',
    },
  })

  for (const c of script.characters) {
    await prisma.character.create({
      data: { episodeId: episode.id, name: c.name, description: c.description },
    })
  }
  for (const s of script.scenes) {
    await prisma.scene.create({
      data: { episodeId: episode.id, name: s.name, description: s.description },
    })
  }
  for (let i = 0; i < script.shots.length; i++) {
    const s = script.shots[i]
    await prisma.shot.create({
      data: {
        episodeId: episode.id,
        index: i,
        description: s.description,
        cameraMove: s.cameraMove,
        dialogue: s.dialogue,
        durationSec: s.durationSec,
      },
    })
  }
}

export async function handleGenerateAssets(episodeId: string): Promise<void> {
  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { characters: true, scenes: true },
  })

  for (const c of episode.characters) {
    const { url } = await generateImage(buildCharacterPrompt(c.name, c.description), [])
    await prisma.character.update({ where: { id: c.id }, data: { refImageUrl: url } })
  }
  for (const s of episode.scenes) {
    const { url } = await generateImage(buildScenePrompt(s.name, s.description), [])
    await prisma.scene.update({ where: { id: s.id }, data: { refImageUrl: url } })
  }
}
