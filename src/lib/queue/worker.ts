import 'dotenv/config'
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '@/lib/env'
import type { JobData, JobName } from './queue'
import { handleGenerateAssets, handleGenerateScript } from './handlers'

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

export const worker = new Worker<JobData, unknown, JobName>(
  'manhua',
  async (job) => {
    switch (job.name) {
      case 'generate-script':
        await handleGenerateScript(job.data.episodeId)
        break
      case 'generate-assets':
        await handleGenerateAssets(job.data.episodeId)
        break
      default:
        throw new Error(`unknown job: ${job.name}`)
    }
  },
  { connection },
)
