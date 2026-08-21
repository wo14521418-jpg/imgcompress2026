import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  JIMENG_API_KEY: z.string().min(1).optional(),
  JIMENG_API_SECRET: z.string().min(1).optional(),
  COSYVOICE_BASE_URL: z.string().url().optional(),
})

export type Env = z.infer<typeof envSchema>

export const env = envSchema.parse(process.env)
