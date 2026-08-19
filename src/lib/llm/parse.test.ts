import { describe, it, expect } from 'vitest'
import { parseScriptJson, ScriptParseError } from './parse'

const valid = JSON.stringify({
  title: '测试',
  characters: [{ name: '甲', description: '主角' }],
  scenes: [{ name: '街道', description: '夜晚' }],
  shots: [{ description: '甲走向镜头', cameraMove: '推', dialogue: '来了', durationSec: 3 }],
})

describe('parseScriptJson', () => {
  it('parses valid JSON', () => {
    expect(parseScriptJson(valid).title).toBe('测试')
  })
  it('strips markdown fences', () => {
    expect(parseScriptJson('```json\n' + valid + '\n```').shots).toHaveLength(1)
  })
  it('throws on missing shots', () => {
    const bad = JSON.stringify({ title: 'x', characters: [], scenes: [] })
    expect(() => parseScriptJson(bad)).toThrow(ScriptParseError)
  })
  it('throws on non-JSON', () => {
    expect(() => parseScriptJson('not json')).toThrow(ScriptParseError)
  })
})
