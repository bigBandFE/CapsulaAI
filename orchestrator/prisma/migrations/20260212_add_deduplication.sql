-- Add deduplication fields to Capsule table
ALTER TABLE "Capsule" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
ALTER TABLE "Capsule" ADD COLUMN IF NOT EXISTS "similarTo" TEXT;
ALTER TABLE "Capsule" ADD COLUMN IF NOT EXISTS "similarityScore" DOUBLE PRECISION;

-- Create unique constraint on contentHash
CREATE UNIQUE INDEX IF NOT EXISTS "Capsule_contentHash_key" ON "Capsule"("contentHash");

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "Capsule_contentHash_idx" ON "Capsule"("contentHash");
