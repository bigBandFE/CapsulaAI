-- Phase 2.7: Self-Improving Memory (Feedback System)

-- Add quality metrics to Capsule
ALTER TABLE "Capsule" 
  ADD COLUMN "qualityScore" DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN "feedbackCount" INTEGER DEFAULT 0;

-- Create FeedbackType enum
CREATE TYPE "FeedbackType" AS ENUM ('RATING', 'CORRECTION', 'FLAG');

-- Create Feedback table
CREATE TABLE "Feedback" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "capsuleId" TEXT NOT NULL,
  "type" "FeedbackType" NOT NULL,
  "rating" INTEGER,
  "correction" JSONB,
  "flagReason" TEXT,
  "comment" TEXT,
  
  CONSTRAINT "Feedback_capsuleId_fkey" 
    FOREIGN KEY ("capsuleId") 
    REFERENCES "Capsule"("id") 
    ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX "Feedback_capsuleId_idx" ON "Feedback"("capsuleId");
CREATE INDEX "Feedback_type_idx" ON "Feedback"("type");
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");
