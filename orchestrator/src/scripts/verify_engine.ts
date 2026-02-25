import { PrismaClient } from '@prisma/client';
import { RelationshipService } from '../services/relationship';

const prisma = new PrismaClient();

async function main() {
  console.log("Memory Engine Verification...");

  // 1. Create a dummy capsule
  const capsule = await prisma.capsule.create({
    data: {
      rawContent: "Steve Jobs founded Apple.",
      summary: "Steve Jobs Apple founder",
      sourceTypes: ["NOTE"],
      status: "COMPLETED"
    }
  });

  // 2. Mock extracted data
  const relationships = [
    { from: "Steve Jobs", fromType: "PERSON", to: "Apple", toType: "ORGANIZATION", type: "FOUNDER_OF", confidence: 0.95 }
  ];

  // 3. Extract Relationships (this will also upsert Entities and link everything)
  console.log("Extracting relationships...");
  await RelationshipService.extractFromCapsule(capsule.id, relationships as any);

  // 4. Verify Database state
  const entities = await prisma.entity.findMany();
  console.log(`Entities Created: ${entities.length}`);

  const rels = await prisma.relation.findMany({ include: { fromEntity: true, toEntity: true, capsuleRelations: true } });
  console.log(`Relations Created: ${rels.length}`);

  console.log("Relations details:");
  rels.forEach(r => {
    console.log(`- ${r.fromEntity.canonicalName} --[${r.relationType}]--> ${r.toEntity.canonicalName} (Mentions: ${r.mentionCount})`);
  });

  // 5. Test merging (add the same relationship again from a new capsule)
  const capsule2 = await prisma.capsule.create({
    data: {
      rawContent: "Steve Jobs was the CEO of Apple.",
      sourceTypes: ["NOTE"],
      status: "COMPLETED"
    }
  });

  await RelationshipService.extractFromCapsule(capsule2.id, relationships as any);

  const mergedRels = await prisma.relation.findMany({ include: { fromEntity: true, toEntity: true } });
  console.log(`\nRelations After Merge: ${mergedRels.length} (Expected 1)`);
  mergedRels.forEach(r => {
    console.log(`- ${r.fromEntity.canonicalName} --[${r.relationType}]--> ${r.toEntity.canonicalName} (Mentions: ${r.mentionCount})`);
  });

  console.log("\nVerification Complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
