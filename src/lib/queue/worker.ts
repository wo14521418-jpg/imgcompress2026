import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '@/lib/env'

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

// 消费 manhua 队列；generate-script 等具体实现在后续任务接入。
export const worker = new Worker(
  'manhua',
  async (job) => {
    switch (job.name) {
      case 'generate-script':
        throw new Error('not implemented: generate-script')
      default:
        throw new Error(`unknown job: ${job.name}`)
    }
  },
  { connection },
)
