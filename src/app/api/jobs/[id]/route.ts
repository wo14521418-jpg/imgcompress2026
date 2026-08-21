import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/lib/queue/queue'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const job = await jobQueue.getJob(id)
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  const state = await job.getState()
  return NextResponse.json({
    id: job.id,
    state,
    progress: job.progress,
    failedReason: job.failedReason,
  })
}
