import { PrismaClient, CapsuleStatus } from '@prisma/client';
import { RelationshipService } from '../services/relationship';

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding complex mock data for Memory Engine V1...");

  // Clean DB
  console.log("Cleaning database...");
  await prisma.capsuleRelation.deleteMany();
  await prisma.capsuleEntity.deleteMany();
  await prisma.relation.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.capsule.deleteMany();

  // Mock Capsules Data
  const capsulesData = [
    {
      source: "Sam Altman returns as OpenAI CEO",
      content: "Sam Altman has returned as CEO of OpenAI, following a dramatic few days that saw him ousted by the board. Greg Brockman also returned. Microsoft CEO Satya Nadella played a key role in the negotiations.",
      date: new Date('2023-11-22T10:00:00Z'),
      rels: [
        { from: "Sam Altman", fromType: "PERSON", to: "OpenAI", toType: "ORGANIZATION", type: "CEO_OF", confidence: 0.99 },
        { from: "Greg Brockman", fromType: "PERSON", to: "OpenAI", toType: "ORGANIZATION", type: "PRESIDENT_OF", confidence: 0.95 },
        { from: "Satya Nadella", fromType: "PERSON", to: "Sam Altman", toType: "PERSON", type: "SUPPORTED", confidence: 0.90 },
        { from: "Satya Nadella", fromType: "PERSON", to: "Microsoft", toType: "ORGANIZATION", type: "CEO_OF", confidence: 0.99 },
        { from: "Microsoft", fromType: "ORGANIZATION", to: "OpenAI", toType: "ORGANIZATION", type: "INVESTED_IN", confidence: 0.99 },
      ]
    },
    {
      source: "OpenAI DevDay 2023 Announcements",
      content: "At its first DevDay, OpenAI announced GPT-4 Turbo, Custom GPTs, and an Assistants API. Sam Altman delivered the keynote in San Francisco.",
      date: new Date('2023-11-06T15:00:00Z'),
      rels: [
        { from: "OpenAI", fromType: "ORGANIZATION", to: "DevDay 2023", toType: "EVENT", type: "HOSTED", confidence: 0.99 },
        { from: "Sam Altman", fromType: "PERSON", to: "DevDay 2023", toType: "EVENT", type: "KEYNOTE_SPEAKER", confidence: 0.95 },
        { from: "OpenAI", fromType: "ORGANIZATION", to: "GPT-4 Turbo", toType: "PRODUCT", type: "CREATED", confidence: 0.99 },
        { from: "OpenAI", fromType: "ORGANIZATION", to: "Custom GPTs", toType: "PRODUCT", type: "CREATED", confidence: 0.98 },
        { from: "DevDay 2023", fromType: "EVENT", to: "San Francisco", toType: "LOCATION", type: "LOCATED_IN", confidence: 0.99 },
      ]
    },
    {
      source: "Anthropic releases Claude 3",
      content: "Anthropic, founded by former OpenAI researchers Dario Amodei and Daniela Amodei, released the Claude 3 model family, competing directly with GPT-4.",
      date: new Date('2024-03-04T12:00:00Z'),
      rels: [
        { from: "Anthropic", fromType: "ORGANIZATION", to: "Claude 3", toType: "PRODUCT", type: "CREATED", confidence: 0.99 },
        { from: "Dario Amodei", fromType: "PERSON", to: "Anthropic", toType: "ORGANIZATION", type: "FOUNDER_OF", confidence: 0.99 },
        { from: "Daniela Amodei", fromType: "PERSON", to: "Anthropic", toType: "ORGANIZATION", type: "FOUNDER_OF", confidence: 0.99 },
        { from: "Dario Amodei", fromType: "PERSON", to: "OpenAI", toType: "ORGANIZATION", type: "FORMER_EMPLOYEE_OF", confidence: 0.95 },
        { from: "Claude 3", fromType: "PRODUCT", to: "GPT-4", toType: "PRODUCT", type: "COMPETES_WITH", confidence: 0.90 },
      ]
    },
    {
      source: "Ilya Sutskever leaves OpenAI to start SSI",
      content: "Ilya Sutskever, co-founder and former Chief Scientist at OpenAI, has officially launched his new company Safe Superintelligence Inc. (SSI), choosing to focus entirely on safe AI development.",
      date: new Date('2024-06-19T14:30:00Z'),
      rels: [
        { from: "Ilya Sutskever", fromType: "PERSON", to: "OpenAI", toType: "ORGANIZATION", type: "FORMER_EMPLOYEE_OF", confidence: 0.99 },
        { from: "Ilya Sutskever", fromType: "PERSON", to: "Safe Superintelligence Inc.", toType: "ORGANIZATION", type: "FOUNDER_OF", confidence: 0.99 },
        { from: "Safe Superintelligence Inc.", fromType: "ORGANIZATION", to: "AI Safety", toType: "CONCEPT", type: "FOCUSES_ON", confidence: 0.95 },
        { from: "Ilya Sutskever", fromType: "PERSON", to: "OpenAI", toType: "ORGANIZATION", type: "CO_FOUNDER_OF", confidence: 0.99 },
      ]
    },
    {
      source: "Microsoft integrates GPT-4 into Copilot",
      content: "Microsoft announced that its Copilot assistant across Windows and Office 365 is now powered by OpenAI's GPT-4 model, strengthening the partnership between Satya Nadella's company and Sam Altman's AI lab.",
      date: new Date('2023-09-21T18:00:00Z'),
      rels: [
        { from: "Microsoft", fromType: "ORGANIZATION", to: "Copilot", toType: "PRODUCT", type: "CREATED", confidence: 0.99 },
        { from: "Copilot", fromType: "PRODUCT", to: "GPT-4", toType: "PRODUCT", type: "POWERED_BY", confidence: 0.99 },
        { from: "Microsoft", fromType: "ORGANIZATION", to: "OpenAI", toType: "ORGANIZATION", type: "PARTNERED_WITH", confidence: 0.95 },
        { from: "Satya Nadella", fromType: "PERSON", to: "Microsoft", toType: "ORGANIZATION", type: "CEO_OF", confidence: 0.99 },
        { from: "Sam Altman", fromType: "PERSON", to: "OpenAI", toType: "ORGANIZATION", type: "CEO_OF", confidence: 0.99 },
      ]
    }
  ];

  for (const item of capsulesData) {
    // 1. Create Capsule
    const capsule = await prisma.capsule.create({
      data: {
        rawContent: item.content,
        summary: item.source,
        sourceTypes: ["NEWS_ARTICLE"],
        status: CapsuleStatus.COMPLETED,
        createdAt: item.date,
        updatedAt: item.date
      }
    });

    console.log(`Created Capsule: ${capsule.summary}`);

    // 2. Extract and Map Relationships & Entities
    // Casting to any to avoid strict type checking of relation 'type' for generic testing
    await RelationshipService.extractFromCapsule(capsule.id, item.rels as any[]);
  }

  // 3. Stats
  const entityCount = await prisma.entity.count();
  const relCount = await prisma.relation.count();

  console.log(`\n✅ Mock Data SEEDED Successfully!`);
  console.log(`Entities: ${entityCount}`);
  console.log(`Relations: ${relCount}`);

}

main().catch(console.error).finally(() => prisma.$disconnect());
