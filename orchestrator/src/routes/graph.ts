import { Router, Request, Response } from 'express';
import { RelationshipService } from '../services/relationship';
import { RelationshipType } from '@prisma/client';

const router = Router();

/**
 * GET /api/graph/stats
 * Get relationship statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await RelationshipService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Get graph stats error:', error);
    res.status(500).json({ error: 'Failed to get graph stats' });
  }
});

/**
 * GET /api/graph/visualization
 * Get visualization data for knowledge graph
 */
router.get('/visualization', async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId as string;
    const depth = parseInt(req.query.depth as string) || 2;

    const data = await RelationshipService.getVisualizationData(entityId, depth);
    res.json(data);
  } catch (error) {
    console.error('Get visualization data error:', error);
    res.status(500).json({ error: 'Failed to get visualization data' });
  }
});

/**
 * GET /api/graph/path
 * Find shortest path between two entities
 */
router.get('/path', async (req: Request, res: Response) => {
  try {
    const from = req.query.from as string;
    const to = req.query.to as string;
    const maxDepth = parseInt(req.query.maxDepth as string) || 5;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to entity IDs are required' });
    }

    const path = await RelationshipService.findPath(from, to, maxDepth);

    if (path) {
      res.json({ found: true, length: path.length, path });
    } else {
      res.json({ found: false, message: 'No path found' });
    }
  } catch (error) {
    console.error('Find path error:', error);
    res.status(500).json({ error: 'Failed to find path' });
  }
});

export default router;
