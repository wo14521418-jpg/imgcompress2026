import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { EpisodeProps, RenderShot } from './types'

export function EpisodeComposition({ shots }: EpisodeProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // 根据累计时长定位当前镜头
  let acc = 0
  let current: RenderShot | undefined
  let startFrame = 0
  for (const s of shots) {
    const len = Math.round((s.durationSec ?? 4) * fps)
    if (frame < acc + len) {
      current = s
      startFrame = acc
      break
    }
    acc += len
  }
  if (!current) current = shots[shots.length - 1]

  if (!current) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: '#fff', fontSize: 48 }}>暂无分镜</div>
      </AbsoluteFill>
    )
  }

  const len = Math.round((current.durationSec ?? 4) * fps)
  const progress = len > 0 ? (frame - startFrame) / len : 0

  // 运镜：含「推/近」则推进，否则轻微拉远（Ken Burns）
  const pushIn = (current.cameraMove ?? '').includes('推') || (current.cameraMove ?? '').includes('近')
  const scale = interpolate(progress, [0, 1], pushIn ? [1, 1.1] : [1.1, 1])
  const translateX = interpolate(progress, [0, 1], [0, -24])

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {current.keyframeUrl ? (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.keyframeUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${scale}) translateX(${translateX}px)`,
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 60 }}>
          <div style={{ color: '#fff', fontSize: 40, textAlign: 'center', lineHeight: 1.5 }}>
            {current.dialogue ?? '缺少关键帧'}
          </div>
        </AbsoluteFill>
      )}

      {current.dialogue && (
        <AbsoluteFill
          style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 180 }}
        >
          <div
            style={{
              color: '#fff',
              fontSize: 44,
              fontWeight: 600,
              textAlign: 'center',
              padding: '16px 28px',
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: 12,
              maxWidth: '86%',
              lineHeight: 1.5,
            }}
          >
            {current.dialogue}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
