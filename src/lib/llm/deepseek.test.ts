import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } }
  },
}))

import { generateScriptWithLLM } from './deepseek'

beforeEach(() => {
  createMock.mockReset()
})

describe('generateScriptWithLLM', () => {
  it('parses the LLM response into a StructuredScript', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: '测试剧',
              characters: [{ name: '甲', description: '主角' }],
              scenes: [{ name: '街道', description: '夜晚' }],
              shots: [{ description: '甲走来', dialogue: '来了', durationSec: 3 }],
            }),
          },
        },
      ],
    })

    const out = await generateScriptWithLLM('都市逆袭')
    expect(out.title).toBe('测试剧')
    expect(out.characters).toHaveLength(1)
    expect(out.shots).toHaveLength(1)
  })
})
