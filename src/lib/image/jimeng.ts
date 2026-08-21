import { env } from '@/lib/env'
import type { GeneratedImage } from './types'
import { volcSignatureV4 } from './sigv4'

const HOST = 'visual.volcengineapi.com'
const REGION = 'cn-north-1'
const SERVICE = 'cv'
const REQ_KEY = 'jimeng_t2i_v31'

interface JimengResponse {
  code?: number
  message?: string
  data?: {
    task_id?: string
    status?: string
    image_urls?: string[]
  }
}

async function callJimeng(action: string, body: Record<string, unknown>): Promise<JimengResponse> {
  if (!env.JIMENG_API_KEY || !env.JIMENG_API_SECRET) {
    throw new Error('JIMENG_API_KEY / JIMENG_API_SECRET is not set')
  }
  const payload = JSON.stringify(body)
  const { authorization, xDate, contentSha256 } = volcSignatureV4({
    method: 'POST',
    host: HOST,
    path: '/',
    query: { Action: action, Version: '2022-08-31' },
    payload,
    accessKeyId: env.JIMENG_API_KEY,
    secretAccessKey: env.JIMENG_API_SECRET,
    region: REGION,
    service: SERVICE,
    now: new Date(),
  })
  const resp = await fetch(`https://${HOST}/?Action=${action}&Version=2022-08-31`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Date': xDate,
      'X-Content-Sha256': contentSha256,
      Authorization: authorization,
    },
    body: payload,
  })
  const data = (await resp.json()) as JimengResponse
  if (data.code && data.code !== 10000) {
    throw new Error(`jimeng ${action} failed: ${JSON.stringify(data)}`)
  }
  return data
}

export async function generateImage(prompt: string, refImages: string[] = []): Promise<GeneratedImage> {
  const submit = await callJimeng('CVSync2AsyncSubmitTask', {
    req_key: REQ_KEY,
    prompt,
    use_pre_llm: true,
    seed: -1,
  })
  const taskId = submit.data?.task_id
  if (!taskId) throw new Error(`jimeng submit returned no task_id: ${JSON.stringify(submit)}`)

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const result = await callJimeng('CVSync2AsyncGetResult', {
      req_key: REQ_KEY,
      task_id: taskId,
      req_json: JSON.stringify({ return_url: true, logo_info: { add_logo: false } }),
    })
    const status = result.data?.status
    const urls = result.data?.image_urls ?? []
    if (status === 'done' && urls.length > 0) {
      return { url: urls[0] }
    }
    if (status === 'failed') {
      throw new Error(`jimeng generation failed: ${JSON.stringify(result)}`)
    }
  }
  throw new Error('jimeng generation timeout')
}
