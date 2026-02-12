import { Router, Request, Response } from 'express';
import { FeedbackService } from '../services/feedback';
import { FeedbackType } from '@prisma/client';

const router = Router();

/**
 * POST /api/feedback
 * Submit feedback for a capsule
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { capsuleId, type, rating, correction, flagReason, comment } = req.body;

    if (!capsuleId || !type) {
      return res.status(400).json({ error: 'capsuleId and type are required' });
    }

    if (!['RATING', 'CORRECTION', 'FLAG'].includes(type)) {
      return res.status(400).json({ error: 'Invalid feedback type' });
    }

    const feedback = await FeedbackService.submitFeedback({
      capsuleId,
      type: type as FeedbackType,
      rating,
      correction,
      flagReason,
      comment
    });

    res.json(feedback);
  } catch (error: any) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit feedback' });
  }
});

/**
 * GET /api/feedback/analytics
 * Get overall feedback analytics
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const analytics = await FeedbackService.getAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

/**
 * GET /api/feedback/low-quality
 * Get low quality capsules
 */
router.get('/low-quality', async (req: Request, res: Response) => {
  try {
    const threshold = parseInt(req.query.threshold as string) || 50;
    const limit = parseInt(req.query.limit as string) || 20;

    const capsules = await FeedbackService.getLowQualityCapsules(threshold, limit);
    res.json({
      threshold,
      count: capsules.length,
      capsules
    });
  } catch (error) {
    console.error('Get low quality capsules error:', error);
    res.status(500).json({ error: 'Failed to get low quality capsules' });
  }
});

/**
 * GET /api/feedback/patterns
 * Get correction patterns
 */
router.get('/patterns', async (req: Request, res: Response) => {
  try {
    const patterns = await FeedbackService.getCorrectionPatterns();
    res.json(patterns);
  } catch (error) {
    console.error('Get correction patterns error:', error);
    res.status(500).json({ error: 'Failed to get correction patterns' });
  }
});

export default router;
