import { afterAll, describe, expect, it } from 'vitest'
import { addJob, jobQueue } from './queue'

// 集成测试：依赖真实 Redis（docker-compose 里的 comic_redis）
describe('jobQueue (real Redis)', () => {
  afterAll(async () => {
    await jobQueue.obliterate({ force: true })
    await jobQueue.close()
  })

  it('enqueues a job and retrieves it back', async () => {
    const job = await addJob({ type: 'render', episodeId: 'ep-integration-test' })
    expect(job.name).toBe('render')

    const fetched = await jobQueue.getJob(job.id!)
    expect(fetched).not.toBeNull()
    expect(fetched!.data).toEqual({ type: 'render', episodeId: 'ep-integration-test' })
  })
})
