import OpenAI from 'openai'
import { env } from '@/lib/env'
import { buildScriptPrompt } from './prompts'
import { parseScriptJson } from './parse'
import type { StructuredScript } from './types'

export async function generateScriptWithLLM(premise: string): Promise<StructuredScript> {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not set')
  }
  const client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' })
  const resp = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: buildScriptPrompt(premise) }],
    temperature: 0.8,
  })
  const raw = resp.choices[0]?.message?.content ?? ''
  return parseScriptJson(raw)
}
