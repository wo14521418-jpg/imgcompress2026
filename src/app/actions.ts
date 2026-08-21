'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'

export async function createProject(formData: FormData) {
  const premise = formData.get('premise')
  if (typeof premise !== 'string' || !premise.trim()) {
    return
  }
  await prisma.project.create({ data: { premise: premise.trim() } })
  revalidatePath('/')
}
