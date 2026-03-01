// routes/review/review.routes.ts

import { Router } from 'express';
import { reviewService } from '../../services/review/review.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createCardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  cardType: z.enum(['FLASHCARD', 'QA', 'FILL_BLANK', 'CLOZE']).optional(),
  capsuleId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateCardSchema = z.object({
  front: z.string().min(1).optional(),
  back: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});

const submitReviewSchema = z.object({
  cardId: z.string(),
  rating: z.number().int().min(0).max(5),
  responseTime: z.number().int().min(0),
});

// Helper to get userId from request (assuming auth middleware sets it)
const getUserId = (req: any): string => {
  // TODO: Replace with actual auth user extraction
  return req.user?.id || req.headers['x-user-id'] as string || 'test-user';
};

// Card Management Routes

// GET /api/review/cards - Get all cards
router.get('/cards', async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      status,
      tags,
      search,
      dueBefore,
      limit = '50',
      offset = '0',
    } = req.query;

    const result = await reviewService.getCards(userId, {
      status: status as string,
      tags: tags ? (tags as string).split(',') : undefined,
      search: search as string,
      dueBefore: dueBefore ? new Date(dueBefore as string) : undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({
      success: true,
      data: result.cards,
      meta: {
        pagination: {
          total: result.total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error) {
    console.error('Error getting cards:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get cards',
      },
    });
  }
});

// POST /api/review/cards - Create a new card
router.post('/cards', async (req, res) => {
  try {
    const userId = getUserId(req);
    const input = createCardSchema.parse(req.body);

    const card = await reviewService.createCard(userId, input);

    res.status(201).json({
      success: true,
      data: card,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors,
        },
      });
      return;
    }
    console.error('Error creating card:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create card',
      },
    });
  }
});

// GET /api/review/cards/:id - Get a single card
router.get('/cards/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const card = await reviewService.getCard(userId, id);

    if (!card) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Card not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: card,
    });
  } catch (error) {
    console.error('Error getting card:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get card',
      },
    });
  }
});

// PUT /api/review/cards/:id - Update a card
router.put('/cards/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const input = updateCardSchema.parse(req.body);

    const card = await reviewService.updateCard(userId, id, input);

    res.json({
      success: true,
      data: card,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors,
        },
      });
      return;
    }
    if ((error as Error).message === 'Card not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Card not found',
        },
      });
      return;
    }
    console.error('Error updating card:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update card',
      },
    });
  }
});

// DELETE /api/review/cards/:id - Delete a card
router.delete('/cards/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    await reviewService.deleteCard(userId, id);

    res.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    if ((error as Error).message === 'Card not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Card not found',
        },
      });
      return;
    }
    console.error('Error deleting card:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete card',
      },
    });
  }
});

// POST /api/review/cards/:id/suspend - Suspend a card
router.post('/cards/:id/suspend', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const card = await reviewService.suspendCard(userId, id);

    res.json({
      success: true,
      data: card,
    });
  } catch (error) {
    if ((error as Error).message === 'Card not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Card not found',
        },
      });
      return;
    }
    console.error('Error suspending card:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to suspend card',
      },
    });
  }
});

// POST /api/review/cards/:id/resume - Resume a suspended card
router.post('/cards/:id/resume', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const card = await reviewService.resumeCard(userId, id);

    res.json({
      success: true,
      data: card,
    });
  } catch (error) {
    if ((error as Error).message === 'Card not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Card not found',
        },
      });
      return;
    }
    console.error('Error resuming card:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to resume card',
      },
    });
  }
});

// POST /api/review/cards/:id/reset - Reset a card
router.post('/cards/:id/reset', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const card = await reviewService.resetCard(userId, id);

    res.json({
      success: true,
      data: card,
    });
  } catch (error) {
    if ((error as Error).message === 'Card not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Card not found',
        },
      });
      return;
    }
    console.error('Error resetting card:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reset card',
      },
    });
  }
});

// Review Session Routes

// GET /api/review/sessions/due - Get due cards for review
router.get('/sessions/due', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { limit = '50' } = req.query;

    const cards = await reviewService.getDueCards(userId, {
      limit: parseInt(limit as string),
    });

    res.json({
      success: true,
      data: cards,
    });
  } catch (error) {
    console.error('Error getting due cards:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get due cards',
      },
    });
  }
});

// POST /api/review/sessions - Start a new review session
router.post('/sessions', async (req, res) => {
  try {
    const userId = getUserId(req);

    const result = await reviewService.startSession(userId);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if ((error as Error).message === 'No cards due for review') {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_CARDS_DUE',
          message: 'No cards due for review',
        },
      });
      return;
    }
    console.error('Error starting session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to start session',
      },
    });
  }
});

// GET /api/review/sessions/:id - Get session details
router.get('/sessions/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const session = await reviewService.getSession(userId, id);

    if (!session) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get session',
      },
    });
  }
});

// POST /api/review/sessions/:id/review - Submit a review
router.post('/sessions/:id/review', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const input = submitReviewSchema.parse(req.body);

    const result = await reviewService.submitReview(userId, id, input);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors,
        },
      });
      return;
    }
    if ((error as Error).message === 'Card not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Card not found',
        },
      });
      return;
    }
    if ((error as Error).message === 'Session not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found',
        },
      });
      return;
    }
    console.error('Error submitting review:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to submit review',
      },
    });
  }
});

// POST /api/review/sessions/:id/complete - Complete a session
router.post('/sessions/:id/complete', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const session = await reviewService.completeSession(userId, id);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    if ((error as Error).message === 'Session not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found',
        },
      });
      return;
    }
    console.error('Error completing session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to complete session',
      },
    });
  }
});

// Statistics Routes

// GET /api/review/stats - Get review statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = getUserId(req);

    const stats = await reviewService.getStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get stats',
      },
    });
  }
});

// GET /api/review/heatmap - Get review heatmap data
router.get('/heatmap', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { startDate, endDate } = req.query;

    const heatmap = await reviewService.getHeatmap(userId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: heatmap,
    });
  } catch (error) {
    console.error('Error getting heatmap:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get heatmap',
      },
    });
  }
});

// GET /api/review/dashboard - Get dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const userId = getUserId(req);

    const dashboard = await reviewService.getDashboard(userId);

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error('Error getting dashboard:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get dashboard',
      },
    });
  }
});

export default router;
