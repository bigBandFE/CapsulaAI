-- Phase 3.1: Entity Relationships for Knowledge Graph

-- Create RelationshipType enum
CREATE TYPE "RelationshipType" AS ENUM (
  'WORKS_FOR',
  'FOUNDED',
  'INVESTED_IN',
  'LOCATED_IN',
  'ACQUIRED',
  'PARTNERED_WITH',
  'REPORTS_TO',
  'OWNS',
  'ATTENDED',
  'MENTIONED_WITH',
  'OTHER'
);

-- Create Relationship table
CREATE TABLE "Relationship" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fromEntityId" TEXT NOT NULL,
  "toEntityId" TEXT NOT NULL,
  "type" "RelationshipType" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "capsuleId" TEXT NOT NULL,
  "metadata" JSONB,
  
  CONSTRAINT "Relationship_fromEntityId_fkey" 
    FOREIGN KEY ("fromEntityId") 
    REFERENCES "Entity"("id") 
    ON DELETE CASCADE,
    
  CONSTRAINT "Relationship_toEntityId_fkey" 
    FOREIGN KEY ("toEntityId") 
    REFERENCES "Entity"("id") 
    ON DELETE CASCADE,
    
  CONSTRAINT "Relationship_capsuleId_fkey" 
    FOREIGN KEY ("capsuleId") 
    REFERENCES "Capsule"("id") 
    ON DELETE CASCADE
);

-- Create unique constraint
CREATE UNIQUE INDEX "Relationship_fromEntityId_toEntityId_type_key" 
  ON "Relationship"("fromEntityId", "toEntityId", "type");

-- Create indexes
CREATE INDEX "Relationship_fromEntityId_idx" ON "Relationship"("fromEntityId");
CREATE INDEX "Relationship_toEntityId_idx" ON "Relationship"("toEntityId");
CREATE INDEX "Relationship_type_idx" ON "Relationship"("type");
CREATE INDEX "Relationship_capsuleId_idx" ON "Relationship"("capsuleId");
