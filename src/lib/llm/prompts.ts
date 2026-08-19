export function buildScriptPrompt(premise: string): string {
  return [
    '你是资深短剧编剧。请根据以下题材，输出一个「动态漫画」单集剧本。',
    '必须只输出 JSON，不要任何解释或 markdown 代码块标记。',
    'JSON 结构如下：',
    '{"title": string, "characters": [{"name": string, "description": string}], "scenes": [{"name": string, "description": string}], "shots": [{"description": string, "cameraMove"?: string, "dialogue"?: string, "durationSec"?: number}]}',
    '要求：3-6 个角色，2-4 个场景，12-24 个镜头，每个镜头含画面描述与台词。',
    `题材：${premise}`,
  ].join('\n')
}
