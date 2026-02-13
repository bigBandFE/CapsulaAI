/*
  Warnings:

  - A unique constraint covering the columns `[contentHash]` on the table `Capsule` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('RATING', 'CORRECTION', 'FLAG');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('WORKS_FOR', 'FOUNDED', 'INVESTED_IN', 'LOCATED_IN', 'ACQUIRED', 'PARTNERED_WITH', 'REPORTS_TO', 'OWNS', 'ATTENDED', 'MENTIONED_WITH', 'OTHER');

-- AlterTable
ALTER TABLE "Capsule" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "feedbackCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "qualityScore" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "similarTo" TEXT,
ADD COLUMN     "similarityScore" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capsuleId" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "rating" INTEGER,
    "correction" JSONB,
    "flagReason" TEXT,
    "comment" TEXT,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "capsuleId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CapsuleToEntity" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Entity_name_idx" ON "Entity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_name_type_key" ON "Entity"("name", "type");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Feedback_capsuleId_idx" ON "Feedback"("capsuleId");

-- CreateIndex
CREATE INDEX "Feedback_type_idx" ON "Feedback"("type");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Relationship_fromEntityId_idx" ON "Relationship"("fromEntityId");

-- CreateIndex
CREATE INDEX "Relationship_toEntityId_idx" ON "Relationship"("toEntityId");

-- CreateIndex
CREATE INDEX "Relationship_type_idx" ON "Relationship"("type");

-- CreateIndex
CREATE INDEX "Relationship_capsuleId_idx" ON "Relationship"("capsuleId");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_fromEntityId_toEntityId_type_key" ON "Relationship"("fromEntityId", "toEntityId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "_CapsuleToEntity_AB_unique" ON "_CapsuleToEntity"("A", "B");

-- CreateIndex
CREATE INDEX "_CapsuleToEntity_B_index" ON "_CapsuleToEntity"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Capsule_contentHash_key" ON "Capsule"("contentHash");

-- CreateIndex
CREATE INDEX "Capsule_contentHash_idx" ON "Capsule"("contentHash");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_capsuleId_fkey" FOREIGN KEY ("capsuleId") REFERENCES "Capsule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_capsuleId_fkey" FOREIGN KEY ("capsuleId") REFERENCES "Capsule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CapsuleToEntity" ADD CONSTRAINT "_CapsuleToEntity_A_fkey" FOREIGN KEY ("A") REFERENCES "Capsule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CapsuleToEntity" ADD CONSTRAINT "_CapsuleToEntity_B_fkey" FOREIGN KEY ("B") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
