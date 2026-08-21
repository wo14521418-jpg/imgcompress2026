import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI 漫剧生成',
  description: '输入题材，生成动态漫画',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  )
}
