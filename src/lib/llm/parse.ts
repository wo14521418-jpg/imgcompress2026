import { z } from 'zod'
import type { StructuredScript } from './types'

export class ScriptParseError extends Error {
  constructor(message: string) { super(message); this.name = 'ScriptParseError' }
}

const shotSchema = z.object({
  description: z.string().min(1),
  cameraMove: z.string().optional(),
  dialogue: z.string().optional(),
  durationSec: z.number().positive().optional(),
})
const scriptSchema = z.object({
  title: z.string().min(1),
  characters: z.array(z.object({ name: z.string(), description: z.string() })),
  scenes: z.array(z.object({ name: z.string(), description: z.string() })),
  shots: z.array(shotSchema).min(1),
})

export function parseScriptJson(raw: string): StructuredScript {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return scriptSchema.parse(JSON.parse(cleaned)) as StructuredScript
  } catch (e) {
    throw new ScriptParseError(e instanceof Error ? e.message : 'invalid script JSON')
  }
}
