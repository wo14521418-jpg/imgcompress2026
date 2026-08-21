import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { addJob } from '@/lib/queue/queue'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const episode = await prisma.episode.findUnique({ where: { id } })
  if (!episode) return NextResponse.json({ error: 'episode not found' }, { status: 404 })

  const job = await addJob({ type: 'generate-assets', episodeId: id })
  return NextResponse.json({ jobId: job.id }, { status: 202 })
}
