import { PrismaClient, CapsuleStatus } from '@prisma/client';
import { RelationshipService } from '../services/relationship';

const prisma = new PrismaClient();

async function fetchHackerNewsTopStories() {
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids = await res.json() as number[];
  const top10 = ids.slice(0, 10);

  const stories = await Promise.all(top10.map(async id => {
    const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    return itemRes.json();
  }));

  return stories.filter(s => s && s.title);
}

// Very simple heuristic to extract mock entities from title text
// Real extraction would use LLM
function mockExtractEntities(title: string) {
  const words = title.split(' ');
  const entities: any[] = [];
  const relations: any[] = [];

  // Extract capitalized words as potential entities
  const capitalized = words.filter(w => w.match(/^[A-Z][a-z]+$/) && w.length > 3);

  if (capitalized.length >= 2) {
    const e1 = capitalized[0];
    const e2 = capitalized[1];

    // Create random relations
    const types = ["MENTIONS", "RELATES_TO", "DISCUSSES", "INCLUDES"];
    const randType = types[Math.floor(Math.random() * types.length)];

    relations.push({
      from: e1,
      fromType: "TOPIC",
      to: e2,
      toType: "TOPIC",
      type: randType,
      confidence: 0.8
    });
  }

  // Also link to Hacker News
  if (capitalized.length > 0) {
    relations.push({
      from: "Hacker News",
      fromType: "WEBSITE",
      to: capitalized[0],
      toType: "TOPIC",
      type: "FEATURES_STORY_ABOUT",
      confidence: 0.99
    });
  }

  return relations;
}

async function main() {
  console.log("Fetching live Hacker News data for Memory Engine V1...");
  const stories = await fetchHackerNewsTopStories();
  console.log(`Fetched ${stories.length} stories.`);

  // Clean DB
  console.log("Cleaning database...");
  await prisma.capsuleRelation.deleteMany();
  await prisma.capsuleEntity.deleteMany();
  await prisma.relation.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.capsule.deleteMany();

  for (const item of stories) {
    // 1. Create Capsule
    const content = `Title: ${item.title}\nURL: ${item.url || 'N/A'}\nBy: ${item.by}\nScore: ${item.score}`;

    const capsule = await prisma.capsule.create({
      data: {
        rawContent: content,
        summary: item.title,
        sourceTypes: ["WEBSITE", "HACKER_NEWS"],
        status: CapsuleStatus.COMPLETED,
      }
    });

    console.log(`Created Capsule: ${capsule.summary}`);

    // 2. Extract Mock Relationships
    const rels = mockExtractEntities(item.title);
    if (rels.length > 0) {
      await RelationshipService.extractFromCapsule(capsule.id, rels as any[]);
    }
  }

  // 3. Stats
  const entityCount = await prisma.entity.count();
  const relCount = await prisma.relation.count();

  console.log(`\n✅ HN Data SEEDED Successfully!`);
  console.log(`Entities: ${entityCount}`);
  console.log(`Relations: ${relCount}`);

}

main().catch(console.error).finally(() => prisma.$disconnect());
