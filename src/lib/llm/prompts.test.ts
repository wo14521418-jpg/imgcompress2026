import { describe, it, expect } from 'vitest'
import { buildScriptPrompt } from './prompts'

describe('buildScriptPrompt', () => {
  it('contains the premise and structural instructions', () => {
    const p = buildScriptPrompt('都市逆袭')
    expect(p).toContain('都市逆袭')
    expect(p).toContain('"shots"')
    expect(p).toContain('只输出 JSON')
  })
})
