-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "title" TEXT,
ADD COLUMN     "visualDirection" TEXT;

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "script" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "refImageUrl" TEXT,
    "voiceId" TEXT,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "refImageUrl" TEXT,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shot" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "cameraMove" TEXT,
    "dialogue" TEXT,
    "durationSec" DOUBLE PRECISION,
    "keyframeUrl" TEXT,
    "voiceUrl" TEXT,

    CONSTRAINT "Shot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "outputUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
