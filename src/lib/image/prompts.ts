export function buildCharacterPrompt(
  name: string,
  description: string,
  visualDirection?: string,
): string {
  return [
    '角色设定图，动态漫画风格，竖屏 9:16，全身或半身立绘',
    `角色：${name}`,
    `设定：${description}`,
    visualDirection ? `视觉方向：${visualDirection}` : '',
  ]
    .filter(Boolean)
    .join('，')
}

export function buildScenePrompt(
  name: string,
  description: string,
  visualDirection?: string,
): string {
  return [
    '场景设定图，动态漫画风格，竖屏 9:16，空镜，无人物',
    `场景：${name}`,
    `设定：${description}`,
    visualDirection ? `视觉方向：${visualDirection}` : '',
  ]
    .filter(Boolean)
    .join('，')
}
