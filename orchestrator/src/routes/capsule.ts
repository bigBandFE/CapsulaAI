import { Router, Request, Response } from 'express';
import { PrismaClient, CapsuleStatus, SourceType } from '@prisma/client';
import { DeduplicationService } from '../services/deduplication';

const router = Router();
const prisma = new PrismaClient();

// Create Capsule
router.post('/', async (req: Request, res: Response) => {
  const { originalContent, sourceType, assets } = req.body; // assets: [{ storagePath, mimeType, size, fileName }]

  try {
    // Check for exact duplicate (Phase 2.5)
    if (originalContent) {
      const duplicate = await DeduplicationService.findExactDuplicate(originalContent);
      if (duplicate) {
        console.log(`[API] Duplicate content detected. Returning existing Capsule: ${duplicate.id}`);
        return res.json({
          isDuplicate: true,
          capsule: duplicate,
          message: 'This content already exists'
        });
      }
    }

    // Generate content hash
    const contentHash = originalContent
      ? DeduplicationService.generateContentHash(originalContent)
      : null;

    const capsule = await prisma.capsule.create({
      data: {
        originalContent,
        sourceType: sourceType as SourceType || SourceType.NOTE,
        status: CapsuleStatus.PENDING,
        contentHash,
        assets: {
          create: assets || []
        }
      },
      include: {
        assets: true
      }
    });

    // TODO: Trigger processing pipeline (async) here

    res.json(capsule);
  } catch (error) {
    console.error('Error creating capsule:', error);
    res.status(500).json({ error: 'Failed to create capsule' });
  }
});

// Get Capsule by ID
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const capsule = await prisma.capsule.findUnique({
      where: { id },
      include: {
        assets: true,
        embeddings: true
      }
    });

    if (!capsule) {
      return res.status(404).json({ error: 'Capsule not found' });
    }

    res.json(capsule);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch capsule' });
  }
});

// List Capsules
router.get('/', async (req: Request, res: Response) => {
  // Simple pagination
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  try {
    const [capsules, total] = await prisma.$transaction([
      prisma.capsule.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { assets: true }
      }),
      prisma.capsule.count()
    ]);

    res.json({
      data: capsules,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list capsules' });
  }
});

export default router;
