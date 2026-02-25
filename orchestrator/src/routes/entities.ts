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
    const entity = await prisma.entity.findFirst({
      where: {
        canonicalName: name,
        type: type as string
      },
      include: {
        capsuleEntities: {
          include: {
            capsule: {
              include: {
                capsuleEntities: {
                  include: { entity: true }
                }
              }
            }
          }
        }
      }
    });

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Extract capsules mapping
    const capsules = entity.capsuleEntities
      .map(ce => ce.capsule)
      .filter(c => c.status === 'COMPLETED')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Group capsules by date
    const timelineByDate: Record<string, any[]> = {};
    capsules.forEach(capsule => {
      const dateKey = capsule.createdAt.toISOString().split('T')[0];
      if (!timelineByDate[dateKey]) {
        timelineByDate[dateKey] = [];
      }

      timelineByDate[dateKey].push({
        id: capsule.id,
        createdAt: capsule.createdAt,
        title: capsule.summary || 'Untitled',
        summary: capsule.summary,
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
        name: entity.canonicalName,
        type: entity.type,
        firstMention: capsules[0]?.createdAt,
        lastMention: capsules[capsules.length - 1]?.createdAt,
        totalMentions: capsules.length
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

    const entity = await prisma.entity.findFirst({
      where: {
        canonicalName: name,
        type: type as string
      },
      include: {
        capsuleEntities: {
          include: {
            capsule: true
          },
          take: 20,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const validCapsules = entity.capsuleEntities
      .map(ce => ce.capsule)
      .filter(c => c.status === 'COMPLETED');

    res.json({
      id: entity.id,
      name: entity.canonicalName,
      type: entity.type,
      createdAt: entity.createdAt,
      capsuleCount: validCapsules.length,
      recentCapsules: validCapsules.map(c => ({
        id: c.id,
        createdAt: c.createdAt,
        title: c.summary || 'Untitled'
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
  const content = capsule.rawContent || '';
  const index = content.toLowerCase().indexOf(entityName.toLowerCase());

  if (index === -1) {
    return capsule.summary || content.substring(0, 100);
  }

  // Extract ~100 chars around the mention
  const start = Math.max(0, index - 50);
  const end = Math.min(content.length, index + entityName.length + 50);
  let context = content.substring(start, end);

  if (start > 0) context = '...' + context;
  if (end < content.length) context = context + '...';

  return context;
}

import { RelationshipService } from '../services/relationship';

/**
 * GET /api/entities/:id/relationships
 * Get relationships for an entity
 */
router.get('/:id/relationships', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const type = req.query.type as string | undefined;
    const direction = req.query.direction as 'from' | 'to' | 'both' | undefined;

    const relationships = await RelationshipService.getEntityRelationships(id, type, direction);
    res.json(relationships);
  } catch (error) {
    console.error('Entity relationships error:', error);
    res.status(500).json({ error: 'Failed to fetch entity relationships' });
  }
});

/**
 * GET /api/entities/:id/related
 * Get related entities (multi-hop)
 */
router.get('/:id/related', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const depth = parseInt(req.query.depth as string) || 2;
    const type = req.query.type as string | undefined;

    const entities = await RelationshipService.getRelatedEntities(id, depth, type);
    res.json(entities);
  } catch (error) {
    console.error('Related entities error:', error);
    res.status(500).json({ error: 'Failed to fetch related entities' });
  }
});

export default router;
