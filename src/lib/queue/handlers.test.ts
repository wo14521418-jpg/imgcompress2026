import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  characterUpdate: vi.fn(),
  sceneUpdate: vi.fn(),
  generateImage: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    episode: { findUniqueOrThrow: mocks.findUniqueOrThrow },
    character: { update: mocks.characterUpdate },
    scene: { update: mocks.sceneUpdate },
  },
}))
vi.mock('@/lib/image/jimeng', () => ({ generateImage: mocks.generateImage }))

import { handleGenerateAssets } from './handlers'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleGenerateAssets', () => {
  it('generates and writes ref images for characters and scenes', async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      characters: [{ id: 'c1', name: '甲', description: '主角' }],
      scenes: [{ id: 's1', name: '街道', description: '夜晚' }],
    })
    mocks.generateImage.mockResolvedValue({ url: 'https://example.com/img.png' })

    await handleGenerateAssets('ep1')

    expect(mocks.generateImage).toHaveBeenCalledTimes(2)
    expect(mocks.characterUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { refImageUrl: 'https://example.com/img.png' },
    })
    expect(mocks.sceneUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { refImageUrl: 'https://example.com/img.png' },
    })
  })
})
