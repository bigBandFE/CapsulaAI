import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateEmbedding } from '../services/embedding';

const router = Router();
const prisma = new PrismaClient();

router.post('/', async (req: Request, res: Response) => {
  const { query, limit = 5 } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const vector = await generateEmbedding(query);

    // Cast vector to string format '[1.0, 2.0, ...]' for pgvector
    const vectorStr = `[${vector.join(',')}]`;

    // Perform similarity search
    // Note: We use raw query because Prisma Client doesn't natively support vector ops fully yet in typed API
    const result = await prisma.$queryRaw`
      SELECT 
        e.id, 
        e."objectId" as "capsuleId", 
        1 - (e.vector <=> ${vectorStr}::vector) as similarity
      FROM "Embedding" e
      WHERE e."objectType" = 'CAPSULE'::"ObjectType"
      ORDER BY similarity DESC
      LIMIT ${Number(limit)};
    `;

    res.json(result);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
