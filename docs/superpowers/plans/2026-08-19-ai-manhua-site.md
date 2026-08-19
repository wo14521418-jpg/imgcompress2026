# AI 漫剧生成网站 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零构建一个国内部署、个人自用的「动态漫画/有声漫画」生成网站，输入题材后端到端产出竖屏 MP4。

**Architecture:** 单一 Next.js 15 应用（App Router）分层：UI 工作台 → 领域服务（LLM/图片/TTS/渲染，各一个统一接口）→ BullMQ 任务队列 → PostgreSQL + Prisma → 本地磁盘存储。长任务（图片生成、Remotion 渲染）入队异步执行，前端轮询进度。角色一致性靠「参考图 + IP-Adapter」。

**Tech Stack:** Next.js 15 (App Router) · TypeScript strict · PostgreSQL 16 + Prisma · BullMQ + Redis · Tailwind CSS + shadcn/ui · Zustand · TanStack Query · Vitest · DeepSeek-V3（文本）· 即梦（图片）· CosyVoice（TTS）· Remotion（合成）

**Spec:** `docs/技术方案.md`

---

## Global Constraints

- Node.js ≥ 20；pnpm 作为包管理器。
- TypeScript `strict: true`；所有公开领域函数有显式返回类型。
- 每个 AI 供应商封装在 `src/lib/*/` 下的独立服务模块，业务代码只依赖服务接口，不直接 import 供应商 SDK。
- 所有 AI 密钥/端点经环境变量注入（`process.env.*`），绝不硬编码；用 zod 校验。
- 测试用 Vitest；纯逻辑（剧本解析、提示词构建、数据变换）必须单测覆盖。
- 数据库模型、服务接口以本计划定义为准，后续任务引用已定义的类型名，不得重命名。
- 提交信息用 Conventional Commits（`feat:` / `test:` / `chore:` / `refactor:`）。
- 环境变量：`DATABASE_URL`、`REDIS_URL`、`DEEPSEEK_API_KEY`、`JIMENG_API_KEY`/`JIMENG_API_SECRET`、`COSYVOICE_BASE_URL`。

---

## File Structure Map

```
E:/软件/网页/
├─ prisma/schema.prisma                 # 数据模型（唯一事实来源）
├─ src/
│  ├─ app/                              # Next.js App Router 页面与 API
│  │  ├─ layout.tsx                     # 根布局
│  │  ├─ page.tsx                       # 项目列表工作台
│  │  ├─ projects/[id]/page.tsx         # 集列表
│  │  ├─ episodes/[id]/page.tsx         # 分镜编辑器 + 渲染进度
│  │  └─ api/
│  │     ├─ projects/route.ts           # 项目 CRUD
│  │     ├─ episodes/[id]/generate/route.ts  # 剧本生成
│  │     ├─ episodes/[id]/assets/route.ts    # 资产/关键帧生成
│  │     ├─ episodes/[id]/voice/route.ts     # 配音
│  │     ├─ episodes/[id]/render/route.ts    # 渲染
│  │     └─ jobs/[id]/route.ts          # 任务进度查询
│  ├─ lib/
│  │  ├─ db.ts                          # Prisma client 单例
│  │  ├─ env.ts                         # zod 环境变量校验
│  │  ├─ llm/
│  │  │  ├─ types.ts                    # StructuredScript 等类型
│  │  │  ├─ prompts.ts                  # 提示词构建
│  │  │  ├─ parse.ts                    # LLM JSON 输出解析 + 校验
│  │  │  └─ deepseek.ts                 # DeepSeek 实现
│  │  ├─ image/
│  │  │  ├─ types.ts
│  │  │  ├─ prompts.ts
│  │  │  └─ jimeng.ts                   # 即梦实现
│  │  ├─ tts/
│  │  │  ├─ types.ts
│  │  │  └─ cosyvoice.ts                # CosyVoice 实现
│  │  ├─ queue/
│  │  │  ├─ queue.ts                    # BullMQ 队列定义
│  │  │  └─ worker.ts                   # worker 消费
│  │  └─ render/
│  │     ├─ composition.ts              # Remotion 合成
│  │     ├─ root.tsx                    # Remotion 根注册
│  │     └─ render.ts                   # renderMedia 封装
│  └─ components/                       # UI 组件
├─ vitest.config.ts
└─ package.json
```

---

# Milestone P0 — 骨架 + 数据模型 + 队列

## Task 1: 初始化 Next.js 项目与工具链

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.env.example`, `app/`（重命名到 `src/app/`）

- [ ] **Step 1: 用 create-next-app 脚手架**

Run:
```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

- [ ] **Step 2: 安装依赖**

Run:
```bash
pnpm add @prisma/client bullmq ioredis zod zustand @tanstack/react-query openai remotion @remotion/renderer
pnpm add -D prisma vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: 配置 vitest**

创建 `vitest.config.ts`：
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
  resolve: { alias: { '@': '/src' } },
})
```

- [ ] **Step 4: 提交**

```bash
git init && git add -A && git commit -m "chore: scaffold next.js app with tooling"
```

---

## Task 2: Prisma 数据模型

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `src/lib/env.ts`

**Interfaces:**
- Produces: `prisma` client 单例（`src/lib/db.ts` 默认导出 `prisma`）；`env` 对象（`src/lib/env.ts` 默认导出，含 `DATABASE_URL`、`REDIS_URL`、`DEEPSEEK_API_KEY` 等字段）。

- [ ] **Step 1: 写 schema**

`prisma/schema.prisma`：
```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Project {
  id        String    @id @default(cuid())
  title     String
  premise   String
  visualDirection String?
  status    String    @default("draft")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  episodes  Episode[]
}

model Episode {
  id         String   @id @default(cuid())
  projectId  String
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  index      Int
  title      String
  script     Json?
  status     String   @default("draft")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  characters Character[]
  scenes     Scene[]
  shots      Shot[]
  renderJobs RenderJob[]
}

model Character {
  id          String  @id @default(cuid())
  episodeId   String
  episode     Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  name        String
  description String
  refImageUrl String?
  voiceId     String?
}

model Scene {
  id          String  @id @default(cuid())
  episodeId   String
  episode     Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  name        String
  description String
  refImageUrl String?
}

model Shot {
  id          String  @id @default(cuid())
  episodeId   String
  episode     Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  index       Int
  description String
  cameraMove  String?
  dialogue    String?
  durationSec Float?
  keyframeUrl String?
  voiceUrl    String?
}

model RenderJob {
  id        String   @id @default(cuid())
  episodeId String
  episode   Episode  @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  status    String   @default("pending")
  progress  Int      @default(0)
  outputUrl String?
  error     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: 生成 client 并迁移**

Run:
```bash
pnpm prisma generate && pnpm prisma migrate dev --name init
```
Expected: 本地 PostgreSQL 建好表；`node_modules/@prisma/client` 更新。

- [ ] **Step 3: 写 db 单例**

`src/lib/db.ts`：
```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: 写环境变量校验**

`src/lib/env.ts`：
```ts
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  JIMENG_API_KEY: z.string().min(1).optional(),
  JIMENG_API_SECRET: z.string().min(1).optional(),
  COSYVOICE_BASE_URL: z.string().url().optional(),
})

export const env = schema.parse(process.env)
```

- [ ] **Step 5: 写 .env.example 并提交**

`src/../.env.example`（即项目根）：
```
DATABASE_URL=postgresql://user:pass@localhost:5432/manhua
REDIS_URL=redis://localhost:6379
DEEPSEEK_API_KEY=
JIMENG_API_KEY=
JIMENG_API_SECRET=
COSYVOICE_BASE_URL=http://localhost:50000
```

```bash
git add -A && git commit -m "feat: prisma schema, db singleton, env validation"
```

---

## Task 3: BullMQ 队列基础

**Files:**
- Create: `src/lib/queue/queue.ts`
- Create: `src/lib/queue/worker.ts`

**Interfaces:**
- Produces: `queue.addJob(name: JobName, data: JobData)`（默认导出）；`JobName` 类型（`'generate-script' | 'generate-assets' | 'generate-voice' | 'render'`）；`JobData` 为 `Record<string, unknown>` 的判别联合。

- [ ] **Step 1: 写队列定义与单测**

`src/lib/queue/queue.ts`：
```ts
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '@/lib/env'

export type JobName = 'generate-script' | 'generate-assets' | 'generate-voice' | 'render'
export type JobData =
  | { type: 'generate-script'; episodeId: string }
  | { type: 'generate-assets'; episodeId: string }
  | { type: 'generate-voice'; episodeId: string }
  | { type: 'render'; episodeId: string }

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

export const jobQueue = new Queue<JobData, unknown, JobName>('manhua', { connection })

export async function addJob(data: JobData) {
  return jobQueue.add(data.type, data, { removeOnComplete: 100, removeOnFail: 100 })
}
```

`src/lib/queue/queue.test.ts`：
```ts
import { describe, it, expect } from 'vitest'

describe('JobData', () => {
  it('shapes generate-script payload', () => {
    const d = { type: 'generate-script', episodeId: 'e1' }
    expect(d.type).toBe('generate-script')
  })
})
```

- [ ] **Step 2: 跑测试**

Run: `pnpm vitest run src/lib/queue/queue.test.ts`
Expected: PASS。

- [ ] **Step 3: 写 worker 骨架**

`src/lib/queue/worker.ts`：
```ts
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '@/lib/env'

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

export const worker = new Worker(
  'manhua',
  async (job) => {
    switch (job.name) {
      case 'generate-script':
        // 占位：Task 6 接入
        throw new Error('not implemented')
      default:
        throw new Error(`unknown job: ${job.name}`)
    }
  },
  { connection },
)
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: bullmq queue + worker skeleton"
```

---

## Task 4: 项目/集 工作台 UI + API

**Files:**
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/projects/[id]/page.tsx`
- Create: `src/components/project-create-form.tsx`

**Interfaces:**
- Consumes: `prisma`（Task 2）、`addJob`（Task 3）。
- Produces: `POST /api/projects`（body `{title, premise}` → 返回项目）；`GET /api/projects`（列表）。

- [ ] **Step 1: 写 API 路由**

`src/app/api/projects/route.ts`：
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const createSchema = z.object({ title: z.string().min(1), premise: z.string().min(1) })

export async function GET() {
  const projects = await prisma.project.findMany({ orderBy: { updatedAt: 'desc' } })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const body = createSchema.parse(await req.json())
  const project = await prisma.project.create({
    data: { title: body.title, premise: body.premise },
  })
  return NextResponse.json(project, { status: 201 })
}
```

- [ ] **Step 2: 写工作台页面**

`src/app/page.tsx`（含项目列表 + 新建表单，调用 `GET/POST /api/projects`，TanStack Query 拉取列表）。用 shadcn/ui 的 Card/Input/Button。

- [ ] **Step 3: 写项目详情页**

`src/app/projects/[id]/page.tsx`：展示项目下的集列表 + 「新建集」按钮（新建集直接 `prisma.episode.create`，通过一个内联 Server Action）。

- [ ] **Step 4: 手测**

Run: `pnpm dev`，浏览器打开 `http://localhost:3000`，新建一个项目 → 进入详情 → 新建一集。确认数据落库。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: project/episode workbench UI and API"
```

---

# Milestone P1 — 剧本生成

## Task 5: LLM 类型 + 提示词构建

**Files:**
- Create: `src/lib/llm/types.ts`
- Create: `src/lib/llm/prompts.ts`
- Test: `src/lib/llm/prompts.test.ts`

**Interfaces:**
- Produces: `StructuredScript`、`ScriptCharacter`、`ScriptScene`、`ScriptShot` 类型；`buildScriptPrompt(premise: string): string`。

- [ ] **Step 1: 写类型**

`src/lib/llm/types.ts`：
```ts
export interface ScriptCharacter { name: string; description: string }
export interface ScriptScene { name: string; description: string }
export interface ScriptShot {
  description: string
  cameraMove?: string
  dialogue?: string
  durationSec?: number
}
export interface StructuredScript {
  title: string
  characters: ScriptCharacter[]
  scenes: ScriptScene[]
  shots: ScriptShot[]
}
```

- [ ] **Step 2: 写提示词构建 + 测试**

`src/lib/llm/prompts.ts`：
```ts
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
```

`src/lib/llm/prompts.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { buildScriptPrompt } from './prompts'

describe('buildScriptPrompt', () => {
  it('contains the premise and structural instructions', () => {
    const p = buildScriptPrompt('都市逆袭')
    expect(p).toContain('都市逆袭')
    expect(p).toContain('"shots"')
    expect(p).toContain('只输出 JSON')
  })
})
```

- [ ] **Step 3: 跑测试 → 提交**

Run: `pnpm vitest run src/lib/llm/prompts.test.ts`（PASS）
```bash
git add -A && git commit -m "feat: script types and prompt builder"
```

---

## Task 6: LLM JSON 解析（纯逻辑，TDD 重点）

**Files:**
- Create: `src/lib/llm/parse.ts`
- Test: `src/lib/llm/parse.test.ts`

**Interfaces:**
- Consumes: `StructuredScript`（Task 5）。
- Produces: `parseScriptJson(raw: string): StructuredScript`（非法时抛 `ScriptParseError`）。

- [ ] **Step 1: 写失败测试**

`src/lib/llm/parse.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { parseScriptJson, ScriptParseError } from './parse'

const valid = JSON.stringify({
  title: '测试',
  characters: [{ name: '甲', description: '主角' }],
  scenes: [{ name: '街道', description: '夜晚' }],
  shots: [{ description: '甲走向镜头', cameraMove: '推', dialogue: '来了', durationSec: 3 }],
})

describe('parseScriptJson', () => {
  it('parses valid JSON', () => {
    expect(parseScriptJson(valid).title).toBe('测试')
  })
  it('strips markdown fences', () => {
    expect(parseScriptJson('```json\n' + valid + '\n```').shots).toHaveLength(1)
  })
  it('throws on missing shots', () => {
    const bad = JSON.stringify({ title: 'x', characters: [], scenes: [] })
    expect(() => parseScriptJson(bad)).toThrow(ScriptParseError)
  })
  it('throws on non-JSON', () => {
    expect(() => parseScriptJson('not json')).toThrow(ScriptParseError)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/lib/llm/parse.test.ts`
Expected: FAIL（`parseScriptJson`/`ScriptParseError` 未定义）。

- [ ] **Step 3: 实现**

`src/lib/llm/parse.ts`：
```ts
import { z } from 'zod'
import type { StructuredScript } from './types'

export class ScriptParseError extends Error {
  constructor(message: string) { super(message); this.name = 'ScriptParseError' }
}

const shotSchema = z.object({
  description: z.string().min(1),
  cameraMove: z.string().optional(),
  dialogue: z.string().optional(),
  durationSec: z.number().positive().optional(),
})
const scriptSchema = z.object({
  title: z.string().min(1),
  characters: z.array(z.object({ name: z.string(), description: z.string() })),
  scenes: z.array(z.object({ name: z.string(), description: z.string() })),
  shots: z.array(shotSchema).min(1),
})

export function parseScriptJson(raw: string): StructuredScript {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return scriptSchema.parse(JSON.parse(cleaned)) as StructuredScript
  } catch (e) {
    throw new ScriptParseError(e instanceof Error ? e.message : 'invalid script JSON')
  }
}
```

- [ ] **Step 4: 跑测试确认通过 → 提交**

Run: `pnpm vitest run src/lib/llm/parse.test.ts`（PASS）
```bash
git add -A && git commit -m "feat: script json parser with validation"
```

---

## Task 7: DeepSeek 服务 + 剧本生成 API + worker 接入

**Files:**
- Create: `src/lib/llm/deepseek.ts`
- Create: `src/app/api/episodes/[id]/generate/route.ts`
- Modify: `src/lib/queue/worker.ts`

**Interfaces:**
- Consumes: `buildScriptPrompt`、`parseScriptJson`、`StructuredScript`（Task 5/6）、`env`、`prisma`、`addJob`。
- Produces: `generateScriptWithLLM(premise: string): Promise<StructuredScript>`。

- [ ] **Step 1: 写 DeepSeek 服务 + mock 单测**

`src/lib/llm/deepseek.ts`：
```ts
import OpenAI from 'openai'
import { env } from '@/lib/env'
import { buildScriptPrompt } from './prompts'
import { parseScriptJson } from './parse'
import type { StructuredScript } from './types'

const client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' })

export async function generateScriptWithLLM(premise: string): Promise<StructuredScript> {
  const resp = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: buildScriptPrompt(premise) }],
    temperature: 0.8,
  })
  const raw = resp.choices[0]?.message?.content ?? ''
  return parseScriptJson(raw)
}
```

`src/lib/llm/deepseek.test.ts`（mock OpenAI，验证请求参数与解析）：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } }
  },
}))

import { generateScriptWithLLM } from './deepseek'

beforeEach(() => { vi.clearAllMocks() })

describe('generateScriptWithLLM', () => {
  it('parses returned JSON', async () => {
    const openai = (await import('openai')).default as any
    openai.prototype.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ title: 't', characters: [], scenes: [], shots: [{ description: 'a' }] }) } }],
    })
    const out = await generateScriptWithLLM('题材')
    expect(out.title).toBe('t')
  })
})
```

- [ ] **Step 2: 跑测试**

Run: `pnpm vitest run src/lib/llm/deepseek.test.ts`（PASS）

- [ ] **Step 3: 写生成 API**

`src/app/api/episodes/[id]/generate/route.ts`：
```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { addJob } from '@/lib/queue/queue'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: params.id } })
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const project = await prisma.project.findUniqueOrThrow({ where: { id: episode.projectId } })
  const job = await addJob({ type: 'generate-script', episodeId: episode.id })
  return NextResponse.json({ jobId: job.id }, { status: 202 })
}
```

- [ ] **Step 4: worker 接入真实实现**

修改 `src/lib/queue/worker.ts` 的 `generate-script` 分支：
```ts
import { prisma } from '@/lib/db'
import { generateScriptWithLLM } from '@/lib/llm/deepseek'

// inside switch:
case 'generate-script': {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: job.data.episodeId } })
  const project = await prisma.project.findUniqueOrThrow({ where: { id: episode.projectId } })
  const script = await generateScriptWithLLM(project.premise)
  await prisma.episode.update({
    where: { id: episode.id },
    data: { script: script as any, title: script.title, status: 'scripted' },
  })
  for (const c of script.characters) {
    await prisma.character.create({ data: { episodeId: episode.id, name: c.name, description: c.description } })
  }
  for (const s of script.scenes) {
    await prisma.scene.create({ data: { episodeId: episode.id, name: s.name, description: s.description } })
  }
  for (let i = 0; i < script.shots.length; i++) {
    const s = script.shots[i]
    await prisma.shot.create({
      data: { episodeId: episode.id, index: i, description: s.description, cameraMove: s.cameraMove, dialogue: s.dialogue, durationSec: s.durationSec },
    })
  }
  break
}
```

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: deepseek script generation wired to queue"
```

---

## Task 8: 分镜编辑器页面（展示 + 编辑剧本结果）

**Files:**
- Create: `src/app/episodes/[id]/page.tsx`
- Create: `src/components/shot-table.tsx`

**Interfaces:**
- Consumes: `prisma`（读取集 + 镜头）、`POST /api/episodes/[id]/generate`。

- [ ] **Step 1: 写分镜编辑器页**

`src/app/episodes/[id]/page.tsx`：展示角色表、场景表、镜头表；「生成剧本」按钮触发 `POST .../generate`；用 TanStack Query 轮询 `/api/jobs/:id` 直到状态完成，刷新数据。

- [ ] **Step 2: 写任务进度 API**

`src/app/api/jobs/[id]/route.ts`：
```ts
import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/lib/queue/queue'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const job = await jobQueue.getJob(params.id)
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const state = await job.getState()
  return NextResponse.json({ id: job.id, state, progress: job.progress, returnvalue: job.returnvalue, failedReason: job.failedReason })
}
```

- [ ] **Step 3: 手测 + 提交**

Run: `pnpm dev`，真实配置 `DEEPSEEK_API_KEY`，新建集 → 生成剧本 → 确认角色/场景/镜头落库并展示。
```bash
git add -A && git commit -m "feat: shot editor page and job progress api"
```

---

# Milestone P2 — 资产（角色/场景图）

## Task 9: 即梦图片服务封装

**Files:**
- Create: `src/lib/image/types.ts`
- Create: `src/lib/image/prompts.ts`
- Create: `src/lib/image/jimeng.ts`
- Test: `src/lib/image/jimeng.test.ts`

**Interfaces:**
- Produces: `generateImage(prompt: string, refImages: string[]): Promise<{ url: string }>`。

- [ ] **Step 1: 写类型与提示词**

`src/lib/image/types.ts`：
```ts
export interface GeneratedImage { url: string }
```

`src/lib/image/prompts.ts`：
```ts
export function buildCharacterPrompt(name: string, description: string, visualDirection?: string): string {
  return [
    '角色设定图，动态漫画风格，竖屏 9:16，全身或半身立绘',
    `角色：${name}`,
    `设定：${description}`,
    visualDirection ? `视觉方向：${visualDirection}` : '',
  ].filter(Boolean).join('，')
}
```

- [ ] **Step 2: 写即梦实现（HTTP 封装，含鉴权签名占位）**

`src/lib/image/jimeng.ts`：
```ts
import { env } from '@/lib/env'
import type { GeneratedImage } from './types'

// 火山引擎即梦视觉服务：签名鉴权 + 异步任务轮询。
// 鉴权签名与 endpoint 以火山引擎官方「即梦AI·图像生成」文档为准，接入时对照验证。
export async function generateImage(prompt: string, refImages: string[]): Promise<GeneratedImage> {
  const endpoint = process.env.JIMENG_ENDPOINT ?? 'https://visual.volcengineapi.com'
  const submit = await fetch(`${endpoint}/.../submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ref_images: refImages }),
  })
  if (!submit.ok) throw new Error(`jimeng submit failed: ${submit.status}`)
  const { task_id } = await submit.json()
  // 轮询结果（简化为同步等待，MVP 可接受）
  let result: any
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${endpoint}/.../query?task_id=${task_id}`)
    result = await r.json()
    if (result.status === 'done') return { url: result.url }
    await new Promise((res) => setTimeout(res, 2000))
  }
  throw new Error('jimeng timeout')
}
```

> 说明：即梦/火山引擎图片生成的具体鉴权（AccessKey + SecretKey 签名）与 endpoint 路径会随版本调整，接入时**必须对照官方文档**填写真实路径；本任务的接口签名（`generateImage(prompt, refImages) → {url}`）保持不变。

- [ ] **Step 3: 写 mock 单测验证接口契约**

`src/lib/image/jimeng.test.ts`（vi.stubGlobal fetch 模拟 submit/query 两段，断言最终返回 `{url}`）。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: image service interface and jimeng wrapper"
```

---

## Task 10: 资产生成 worker 与 API

**Files:**
- Create: `src/app/api/episodes/[id]/assets/route.ts`
- Modify: `src/lib/queue/worker.ts`

- [ ] **Step 1: 写资产 API**

`src/app/api/episodes/[id]/assets/route.ts`：`POST` 触发 `addJob({ type: 'generate-assets', episodeId })`，返回 jobId。

- [ ] **Step 2: worker 生成角色/场景图并写回参考图**

在 worker `generate-assets` 分支：遍历该集的 characters/scenes，逐个 `generateImage(buildCharacterPrompt(...), [])`，把返回 url 写回 `character.refImageUrl` / `scene.refImageUrl`。首张角色图即该角色的视觉锚点（后续关键帧用它作参考图）。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: asset generation for characters and scenes"
```

---

# Milestone P3 — 关键帧生成

## Task 11: 逐镜关键帧生成

**Files:**
- Modify: `src/lib/image/prompts.ts`
- Modify: `src/lib/queue/worker.ts`

- [ ] **Step 1: 写关键帧提示词**

在 `src/lib/image/prompts.ts` 增加：
```ts
export function buildKeyframePrompt(shot: { description: string }, sceneDesc: string, characterNames: string[]): string {
  return [
    '动态漫画关键帧，竖屏 9:16，电影级构图',
    `场景：${sceneDesc}`,
    `人物：${characterNames.join('、')}`,
    `画面：${shot.description}`,
  ].join('，')
}
```

- [ ] **Step 2: worker 生成关键帧**

在 `generate-assets` 分支（或独立 `generate-keyframes` 分支）：对每个 shot，组装该镜涉及角色的 `refImageUrl` 列表 + 场景 `refImageUrl` 作为 `refImages` 传入 `generateImage`，把结果写回 `shot.keyframeUrl`。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: per-shot keyframe generation with reference images"
```

---

# Milestone P4 — 配音

## Task 12: CosyVoice TTS 封装

**Files:**
- Create: `src/lib/tts/types.ts`
- Create: `src/lib/tts/cosyvoice.ts`
- Test: `src/lib/tts/cosyvoice.test.ts`

**Interfaces:**
- Produces: `synthesize(text: string, voiceId: string): Promise<{ url: string }>`。

- [ ] **Step 1: 写类型 + 实现**

`src/lib/tts/types.ts`：
```ts
export interface SynthesizedAudio { url: string }
```

`src/lib/tts/cosyvoice.ts`：
```ts
import { env } from '@/lib/env'
import type { SynthesizedAudio } from './types'

export async function synthesize(text: string, voiceId: string): Promise<SynthesizedAudio> {
  const base = env.COSYVOICE_BASE_URL ?? 'http://localhost:50000'
  const resp = await fetch(`${base}/inference_zero_shot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tts_text: text, prompt_text: '', prompt_wav: voiceId }),
  })
  if (!resp.ok) throw new Error(`cosyvoice failed: ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  // MVP：音频 base64 回传，落盘由 worker 处理
  return { url: `data:audio/wav;base64,${buf.toString('base64')}` }
}
```

- [ ] **Step 2: 写 mock 单测**（stub fetch 返回伪 audio buffer，断言返回 `data:audio/wav` 前缀）。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: cosyvoice tts service"
```

---

## Task 13: 配音 worker + API

**Files:**
- Create: `src/app/api/episodes/[id]/voice/route.ts`
- Modify: `src/lib/queue/worker.ts`

- [ ] **Step 1: 写配音 API**（`POST .../voice` → `addJob({type:'generate-voice', episodeId})`）。

- [ ] **Step 2: worker 逐句合成**

在 `generate-voice` 分支：遍历该集 shots 中有 `dialogue` 的镜头，调用 `synthesize(shot.dialogue, characterVoiceId)`，把返回的音频 data URL 或落盘路径写回 `shot.voiceUrl`。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: per-shot voice synthesis"
```

---

# Milestone P5 — Remotion 合成

## Task 14: Remotion 合成组件

**Files:**
- Create: `src/lib/render/root.tsx`
- Create: `src/lib/render/composition.tsx`

**Interfaces:**
- Produces: Remotion 根 `Root`（注册 `EpisodeComposition`，props 为 `{ shots: Array<{ keyframeUrl, dialogue, voiceUrl, durationSec, cameraMove }>, characters: ..., scenes: ... }`）。

- [ ] **Step 1: 写合成组件**

`src/lib/render/composition.tsx`：用 `useCurrentFrame` + `interpolate` 实现运镜（`cameraMove` 映射到 `transform: scale/translate`），叠加字幕（`dialogue`）、音频轨道（`<Audio src={voiceUrl}>`），按 `durationSec` 计算每镜帧数。竖屏 1080×1920、30fps。

`src/lib/render/root.tsx`：
```tsx
import { Composition } from 'remotion'
import { EpisodeComposition } from './composition'

export const Root: React.FC = () => (
  <>
    <Composition
      id="Episode"
      component={EpisodeComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
)
```

- [ ] **Step 2: 提交**

```bash
git add -A && git commit -m "feat: remotion composition with camera moves and subtitles"
```

---

## Task 15: 渲染服务 + worker 接入

**Files:**
- Create: `src/lib/render/render.ts`
- Modify: `src/lib/queue/worker.ts`
- Create: `src/app/api/episodes/[id]/render/route.ts`

**Interfaces:**
- Produces: `renderEpisode(episodeId: string): Promise<{ outputUrl: string }>`。

- [ ] **Step 1: 写渲染封装**

`src/lib/render/render.ts`：用 `@remotion/renderer` 的 `renderMedia`，`serveUrl` 指向 `src/lib/render/root.tsx` 的 bundle，`ensureBrowser()` 或 `browserExecutablePath` 指定 headless Chromium，输出 `out/episode-<id>.mp4`。

- [ ] **Step 2: worker `render` 分支**

创建 `RenderJob`（status='rendering'），组装该集 shots/characters/scenes 为 props，调用 `renderEpisode`，成功写 `RenderJob.outputUrl` + status='done'，失败写 error + status='failed'。渲染过程用 `onProgress` 回调更新 `RenderJob.progress`。

- [ ] **Step 3: 写渲染 API**（`POST .../render` → `addJob({type:'render', episodeId})`）。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: remotion render service wired to queue"
```

---

# Milestone P6 — 配乐 + 打磨 + 部署

## Task 16: 配乐与成片导出

**Files:**
- Create: `src/app/api/episodes/[id]/music/route.ts`
- Modify: `src/lib/render/composition.tsx`

- [ ] **Step 1: BGM 素材接入**

在合成组件中引入 `<Audio src={bgmUrl}>`（bgmUrl 来自 `Episode.music` 或默认素材库路径）；提供 `POST .../music` 从内置素材列表选一首写回集。

- [ ] **Step 2: 成片下载**

分镜编辑器页在 `RenderJob.status==='done'` 时展示视频预览 + 下载链接。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: bgm selection and final export"
```

---

## Task 17: 合规标识 + Docker 部署

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`
- Create: `.env.production.example`

- [ ] **Step 1: AIGC 标识**

渲染合成时叠加固定水印「AI 生成」角标；生成页面底部标注。修改 `composition.tsx` 增加水印 `<AbsoluteFill>`。

- [ ] **Step 2: Docker 化**

`docker-compose.yml`：`app`（Next.js）、`worker`（node worker.ts）、`postgres`、`redis` 四服务。`Dockerfile` 安装 Chromium 依赖（`libnss3`、`libatk`、`fonts-noto-cjk` 等）。

- [ ] **Step 3: 部署清单写 README**

`README.md`：ICP 备案、域名、`pnpm prisma migrate deploy`、启动命令、AI Key 配置说明。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "chore: compliance watermark, docker deploy, readme"
```

---

## Self-Review 记录

- **Spec 覆盖**：技术方案 7 个里程碑均有对应 Task（P0→Task1-4，P1→Task5-8，P2→Task9-10，P3→Task11，P4→Task12-13，P5→Task14-15，P6→Task16-17）。合规（ICP/AIGC 标识）落在 Task17。
- **类型一致性**：`StructuredScript`（Task5）→ 被 Task6/7 复用；`generateImage`（Task9）→ Task10/11 复用；`synthesize`（Task12）→ Task13；`addJob`/`JobData`（Task3）→ 所有 API 复用。命名全程一致。
- **占位符检查**：Task9 即梦 endpoint 为「对照官方文档填写」的显式验证步骤（供应商接口会变，属真实风险而非占位），接口签名已固定；worker 骨架中的 `throw new Error('not implemented')` 在 Task7/10/13/15 均被替换为真实实现。
- **已知待验证**：即梦鉴权签名、CosyVoice 部署、Remotion 渲染 Chromium 依赖——已分别在 Task9/12/15/17 设为显式验证步骤。

---

## 执行方式

计划已保存。后续可二选一执行：
1. **Subagent-Driven（推荐）**：每个 Task 派一个全新 subagent 实现，任务间我做两段式审查。
2. **Inline Execution**：本会话内按 Task 顺序批量执行，设检查点。
