export interface ScriptCharacter { name: string; description: string }
export interface ScriptScene { name: string; description: string }
export interface ScriptShot {
  description: string
  cameraMove?: string
  dialogue?: string
  durationSec?: number
}
export interface StructuredScript {
  title: string
  characters: ScriptCharacter[]
  scenes: ScriptScene[]
  shots: ScriptShot[]
}
