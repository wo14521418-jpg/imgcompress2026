'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateScriptButton({ episodeId }: { episodeId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  async function handleClick() {
    setLoading(true)
    setStatus('入队中…')

    const resp = await fetch(`/api/episodes/${episodeId}/generate`, { method: 'POST' })
    if (!resp.ok) {
      setStatus(`入队失败（HTTP ${resp.status}）`)
      setLoading(false)
      return
    }
    const { jobId } = await resp.json()
    setStatus('生成中…')

    for (let i = 0; i < 150; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const jobResp = await fetch(`/api/jobs/${jobId}`)
      if (!jobResp.ok) break
      const job = await jobResp.json()
      if (job.state === 'completed') {
        setStatus('完成')
        setLoading(false)
        router.refresh()
        return
      }
      if (job.state === 'failed') {
        setStatus(`失败：${job.failedReason ?? '未知错误'}`)
        setLoading(false)
        return
      }
    }
    setStatus('超时')
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
      >
        {loading ? '生成中…' : '生成剧本'}
      </button>
      {status && <span className="text-xs text-neutral-500">{status}</span>}
    </div>
  )
}
