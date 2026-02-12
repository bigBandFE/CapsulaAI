import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/entities/:name/timeline?type=PERSON
 * Returns chronological timeline of all capsules mentioning this entity
 */
router.get('/:name/timeline', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'type parameter required (e.g., PERSON, ORGANIZATION)' });
    }

    // Find the entity
    const entity = await prisma.entity.findUnique({
      where: {
        name_type: {
          name: name,
          type: type as string
        }
      },
      include: {
        capsules: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'asc' },
          include: {
            entities: true
          }
        }
      }
    });

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Group capsules by date
    const timelineByDate: Record<string, any[]> = {};
    entity.capsules.forEach(capsule => {
      const dateKey = capsule.createdAt.toISOString().split('T')[0];
      if (!timelineByDate[dateKey]) {
        timelineByDate[dateKey] = [];
      }

      timelineByDate[dateKey].push({
        id: capsule.id,
        createdAt: capsule.createdAt,
        title: (capsule.structuredData as any)?.meta?.title || 'Untitled',
        summary: (capsule.structuredData as any)?.content?.summary,
        context: extractEntityContext(capsule, name)
      });
    });

    // Convert to array format
    const timeline = Object.entries(timelineByDate).map(([date, capsules]) => ({
      date,
      capsules
    }));

    res.json({
      entity: {
        name: entity.name,
        type: entity.type,
        firstMention: entity.capsules[0]?.createdAt,
        lastMention: entity.capsules[entity.capsules.length - 1]?.createdAt,
        totalMentions: entity.capsules.length
      },
      timeline
    });
  } catch (error) {
    console.error('Entity timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch entity timeline' });
  }
});

/**
 * GET /api/entities/:name?type=PERSON
 * Get entity details and linked capsules
 */
router.get('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'type parameter required' });
    }

    const entity = await prisma.entity.findUnique({
      where: {
        name_type: {
          name: name,
          type: type as string
        }
      },
      include: {
        capsules: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 20 // Limit to recent 20
        }
      }
    });

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      createdAt: entity.createdAt,
      capsuleCount: entity.capsules.length,
      recentCapsules: entity.capsules.map(c => ({
        id: c.id,
        createdAt: c.createdAt,
        title: (c.structuredData as any)?.meta?.title || 'Untitled'
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch entity' });
  }
});

/**
 * Helper: Extract context around entity mention from capsule
 */
function extractEntityContext(capsule: any, entityName: string): string {
  const content = capsule.originalContent || '';
  const index = content.toLowerCase().indexOf(entityName.toLowerCase());

  if (index === -1) {
    return (capsule.structuredData as any)?.content?.summary || content.substring(0, 100);
  }

  // Extract ~100 chars around the mention
  const start = Math.max(0, index - 50);
  const end = Math.min(content.length, index + entityName.length + 50);
  let context = content.substring(start, end);

  if (start > 0) context = '...' + context;
  if (end < content.length) context = context + '...';

  return context;
}

export default router;
