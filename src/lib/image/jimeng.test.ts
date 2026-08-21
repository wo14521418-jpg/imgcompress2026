import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateImage } from './jimeng'

describe('generateImage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('submits a task then returns the image URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ code: 10000, data: { task_id: 'task-1' } }) })
      .mockResolvedValueOnce({
        json: async () => ({
          code: 10000,
          data: { status: 'done', image_urls: ['https://example.com/a.png'] },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const out = await generateImage('一个角色', [])
    expect(out.url).toBe('https://example.com/a.png')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws when submit is denied', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ code: 50400, message: 'Access Denied' }) }),
    )
    await expect(generateImage('x', [])).rejects.toThrow()
  })
})
