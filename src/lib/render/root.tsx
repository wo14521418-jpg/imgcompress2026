import { Composition, registerRoot } from 'remotion'
import { EpisodeComposition } from './composition'
import type { EpisodeProps } from './types'

export const FPS = 30

export const Root: React.FC = () => (
  <Composition
    id="Episode"
    component={EpisodeComposition as React.FC<Record<string, unknown>>}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={FPS}
    calculateMetadata={async ({ props }) => {
      const p = props as unknown as EpisodeProps
      const shots = p.shots ?? []
      const totalSec = shots.reduce((acc, s) => acc + (s.durationSec ?? 4), 0)
      return { durationInFrames: Math.max(FPS, Math.round(totalSec * FPS)) }
    }}
  />
)

registerRoot(Root)
