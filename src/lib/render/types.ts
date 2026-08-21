export interface RenderShot {
  keyframeUrl: string | null
  dialogue: string | null
  durationSec: number | null
  cameraMove: string | null
}

export type EpisodeProps = {
  shots: RenderShot[]
}
