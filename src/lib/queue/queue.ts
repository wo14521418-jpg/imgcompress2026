import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '@/lib/env'

export type JobName =
  | 'generate-script'
  | 'generate-assets'
  | 'generate-keyframes'
  | 'generate-voice'
  | 'render'

export type JobData =
  | { type: 'generate-script'; episodeId: string }
  | { type: 'generate-assets'; episodeId: string }
  | { type: 'generate-keyframes'; episodeId: string }
  | { type: 'generate-voice'; episodeId: string }
  | { type: 'render'; episodeId: string }

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

export const jobQueue = new Queue<JobData, unknown, JobName>('manhua', { connection })

export async function addJob(data: JobData) {
  return jobQueue.add(data.type, data, { removeOnComplete: 100, removeOnFail: 100 })
}
