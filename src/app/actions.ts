'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'

export async function createProject(formData: FormData) {
  const premise = formData.get('premise')
  if (typeof premise !== 'string' || !premise.trim()) {
    return
  }
  const trimmed = premise.trim()
  await prisma.project.create({
    data: {
      // title 暂用题材前 20 字；完整工作台会提供独立标题字段
      title: trimmed.slice(0, 20),
      premise: trimmed,
    },
  })
  revalidatePath('/')
}
