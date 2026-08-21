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

export function buildKeyframePrompt(
  shotDescription: string,
  sceneDesc: string,
  characterNames: string[],
): string {
  return [
    '动态漫画关键帧，竖屏 9:16，电影级构图，高细节',
    characterNames.length ? `人物：${characterNames.join('、')}` : '',
    sceneDesc ? `场景：${sceneDesc}` : '',
    `画面：${shotDescription}`,
  ]
    .filter(Boolean)
    .join('，')
}
