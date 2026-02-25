import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/timeline?start=2024-01-01&end=2024-01-31
 * Returns capsules within a date range with statistics
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end dates are required (ISO format)' });
    }

    const startDate = new Date(start as string);
    const endDate = new Date(end as string);

    // Fetch capsules in range
    const capsules = await prisma.capsule.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        status: 'COMPLETED'
      },
      include: {
        capsuleEntities: { include: { entity: true } },
        assets: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate statistics
    const stats = {
      totalCapsules: capsules.length,
      bySourceType: capsules.reduce((acc: any, c) => {
        const type = c.sourceTypes[0] || 'NOTE';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
      topEntities: await getTopEntities(startDate, endDate)
    };

    res.json({
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        type: 'custom'
      },
      stats,
      capsules: capsules.map((c: any) => ({
        id: c.id,
        createdAt: c.createdAt,
        sourceTypes: c.sourceTypes,
        title: c.summary || 'Untitled',
        summary: c.summary,
        entities: c.capsuleEntities.map((ce: any) => ({ name: ce.entity.canonicalName, type: ce.entity.type }))
      }))
    });
  } catch (error) {
    console.error('Timeline query error:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

/**
 * GET /api/timeline/daily?date=2024-01-15
 * Returns capsules for a specific day
 */
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' });
    }

    const targetDate = new Date(date as string);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const capsules = await prisma.capsule.findMany({
      where: {
        createdAt: {
          gte: targetDate,
          lt: nextDay
        },
        status: 'COMPLETED'
      },
      include: { capsuleEntities: { include: { entity: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      date: targetDate.toISOString().split('T')[0],
      count: capsules.length,
      capsules: capsules.map(c => ({
        id: c.id,
        createdAt: c.createdAt,
        title: c.summary || 'Untitled',
        entities: c.capsuleEntities.map((ce: any) => ({ name: ce.entity.canonicalName, type: ce.entity.type }))
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch daily timeline' });
  }
});

/**
 * GET /api/timeline/heatmap?year=2024
 * Returns daily capsule counts for visualization
 */
router.get('/heatmap', async (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

    const startDate = new Date(`${targetYear}-01-01`);
    const endDate = new Date(`${targetYear}-12-31`);

    // Get all capsules for the year
    const capsules = await prisma.capsule.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        },
        status: 'COMPLETED'
      },
      select: {
        createdAt: true
      }
    });

    // Group by date
    const dateCounts: Record<string, number> = {};
    capsules.forEach(c => {
      const dateKey = c.createdAt.toISOString().split('T')[0];
      dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
    });

    // Generate full year data (365/366 days)
    const data: Array<{ date: string; count: number }> = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      data.push({
        date: dateKey,
        count: dateCounts[dateKey] || 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate stats
    const counts = data.map(d => d.count);
    const maxCount = Math.max(...counts);
    const maxDate = data.find(d => d.count === maxCount)?.date;

    res.json({
      year: targetYear,
      data,
      stats: {
        totalDays: data.length,
        activeDays: data.filter(d => d.count > 0).length,
        averagePerDay: (capsules.length / data.length).toFixed(2),
        maxInDay: maxCount,
        maxDate
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate heatmap' });
  }
});

/**
 * Helper: Get top entities in a date range
 */
async function getTopEntities(start: Date, end: Date, limit: number = 10) {
  const result = await prisma.$queryRaw<Array<{ name: string; type: string; count: bigint }>>`
    SELECT e."canonicalName" as name, e.type, COUNT(DISTINCT c.id) as count
    FROM "Entity" e
    JOIN "CapsuleEntity" ce ON e.id = ce."entityId"
    JOIN "Capsule" c ON ce."capsuleId" = c.id
    WHERE c."createdAt" >= ${start} AND c."createdAt" <= ${end}
    GROUP BY e."canonicalName", e.type

    ORDER BY count DESC
    LIMIT ${limit}
  `;

  return result.map(r => ({
    name: r.name,
    type: r.type,
    count: Number(r.count)
  }));
}

export default router;
