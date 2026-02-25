import { PrismaClient, FeedbackType } from '@prisma/client';

const prisma = new PrismaClient();

export interface FeedbackSubmission {
  capsuleId: string;
  type: FeedbackType;
  rating?: number;
  correction?: {
    field: string;
    oldValue: any;
    newValue: any;
    reason: string;
  };
  flagReason?: string;
  comment?: string;
}

export interface QualityMetrics {
  averageRating: number;
  correctionRate: number;
  flagRate: number;
  qualityScore: number;
}

export class FeedbackService {
  /**
   * Submit feedback for a capsule
   */
  static async submitFeedback(submission: FeedbackSubmission) {
    // Validate submission
    if (submission.type === 'RATING' && (!submission.rating || submission.rating < 1 || submission.rating > 5)) {
      throw new Error('Rating must be between 1 and 5');
    }

    if (submission.type === 'CORRECTION' && !submission.correction) {
      throw new Error('Correction details are required for CORRECTION type');
    }

    if (submission.type === 'FLAG' && !submission.flagReason) {
      throw new Error('Flag reason is required for FLAG type');
    }

    // Create feedback
    const feedback = await prisma.feedback.create({
      data: {
        capsuleId: submission.capsuleId,
        type: submission.type,
        rating: submission.rating,
        correction: submission.correction as any,
        flagReason: submission.flagReason,
        comment: submission.comment
      }
    });

    // Feedback metrics are now computed dynamically due to Capsule Schema update.
    return feedback;
  }

  /**
   * Get all feedback for a capsule
   */
  static async getCapsuleFeedback(capsuleId: string) {
    const feedback = await prisma.feedback.findMany({
      where: { capsuleId },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate quality score dynamically since it was removed from Capsule
    const metrics = this.calculateQualityMetrics(feedback);

    // Calculate average rating
    const ratings = feedback.filter(f => f.type === 'RATING' && f.rating).map(f => f.rating!);
    const averageRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

    return {
      capsuleId,
      feedbackCount: feedback.length,
      averageRating,
      qualityScore: metrics.qualityScore,
      feedback
    };
  }

  /**
   * Calculate and update quality score for a capsule
   */
  static async updateQualityScore(capsuleId: string) {
    const feedback = await prisma.feedback.findMany({
      where: { capsuleId }
    });

    if (feedback.length === 0) {
      return;
    }

    const metrics = this.calculateQualityMetrics(feedback);
    return metrics;
  }

  /**
   * Calculate quality metrics from feedback
   */
  static calculateQualityMetrics(feedback: any[]): QualityMetrics {
    const totalFeedback = feedback.length;

    // Average rating (1-5 scale, normalized to 0-1)
    const ratings = feedback.filter(f => f.type === 'RATING' && f.rating).map(f => f.rating);
    const averageRating = ratings.length > 0
      ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length / 5.0
      : 0.5; // Default to neutral if no ratings

    // Correction rate (% of feedback that are corrections)
    const corrections = feedback.filter(f => f.type === 'CORRECTION').length;
    const correctionRate = corrections / totalFeedback;

    // Flag rate (% of feedback that are flags)
    const flags = feedback.filter(f => f.type === 'FLAG').length;
    const flagRate = flags / totalFeedback;

    // Quality score formula:
    // (averageRating * 0.6) + ((1 - correctionRate) * 0.3) + ((1 - flagRate) * 0.1) * 100
    const qualityScore = (
      (averageRating * 0.6) +
      ((1 - correctionRate) * 0.3) +
      ((1 - flagRate) * 0.1)
    ) * 100;

    return {
      averageRating: averageRating * 5, // Convert back to 1-5 scale
      correctionRate,
      flagRate,
      qualityScore: Math.round(qualityScore * 100) / 100 // Round to 2 decimals
    };
  }

  /**
   * Get overall feedback analytics
   */
  static async getAnalytics() {
    const allFeedback = await prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const totalFeedback = allFeedback.length;

    // By type
    const byType = {
      RATING: allFeedback.filter(f => f.type === 'RATING').length,
      CORRECTION: allFeedback.filter(f => f.type === 'CORRECTION').length,
      FLAG: allFeedback.filter(f => f.type === 'FLAG').length
    };

    // Average rating
    const ratings = allFeedback.filter(f => f.type === 'RATING' && f.rating).map(f => f.rating!);
    const averageRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

    // Top issues (flag reasons)
    const flagReasons: { [key: string]: number } = {};
    allFeedback.filter(f => f.type === 'FLAG' && f.flagReason).forEach(f => {
      const reason = f.flagReason!;
      flagReasons[reason] = (flagReasons[reason] || 0) + 1;
    });

    const topIssues = Object.entries(flagReasons)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Quality trend (last 30 days, grouped by day)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const capsules = await prisma.capsule.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        feedback: { some: {} }
      },
      include: {
        feedback: true
      }
    });

    const qualityByDay: { [key: string]: { total: number; count: number } } = {};
    capsules.forEach(c => {
      const date = c.createdAt.toISOString().split('T')[0];
      if (!qualityByDay[date]) {
        qualityByDay[date] = { total: 0, count: 0 };
      }
      const score = this.calculateQualityMetrics(c.feedback).qualityScore;
      qualityByDay[date].total += score;
      qualityByDay[date].count += 1;
    });

    const qualityTrend = Object.entries(qualityByDay)
      .map(([date, data]) => ({
        date,
        averageQuality: Math.round((data.total / data.count) * 100) / 100
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalFeedback,
      byType,
      averageRating: Math.round(averageRating * 100) / 100,
      topIssues,
      qualityTrend
    };
  }

  /**
   * Get low quality capsules
   */
  static async getLowQualityCapsules(threshold: number = 50, limit: number = 20) {
    const allWithFeedback = await prisma.capsule.findMany({
      where: {
        feedback: { some: {} }
      },
      include: {
        feedback: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const capsules = allWithFeedback
      .map(c => {
        const metrics = this.calculateQualityMetrics(c.feedback);
        return {
          ...c,
          qualityScore: metrics.qualityScore,
          feedbackCount: c.feedback.length,
          recentFeedback: c.feedback.slice(0, 3)
        };
      })
      .filter(c => c.qualityScore < threshold)
      .sort((a, b) => a.qualityScore - b.qualityScore)
      .slice(0, limit);

    return capsules.map(c => ({
      id: c.id,
      title: c.summary || 'Untitled',
      sourceTypes: c.sourceTypes,
      qualityScore: c.qualityScore,
      feedbackCount: c.feedbackCount,
      recentFeedback: c.recentFeedback
    }));
  }

  /**
   * Analyze correction patterns
   */
  static async getCorrectionPatterns() {
    const corrections = await prisma.feedback.findMany({
      where: { type: 'CORRECTION' }
    });

    // Group by field
    const fieldErrors: { [key: string]: number } = {};
    const examples: { [key: string]: any[] } = {};

    corrections.forEach(c => {
      if (c.correction) {
        const correction = c.correction as any;
        const field = correction.field || 'unknown';

        fieldErrors[field] = (fieldErrors[field] || 0) + 1;

        if (!examples[field]) {
          examples[field] = [];
        }

        if (examples[field].length < 3) {
          examples[field].push({
            oldValue: correction.oldValue,
            newValue: correction.newValue,
            reason: correction.reason
          });
        }
      }
    });

    const patterns = Object.entries(fieldErrors)
      .map(([field, count]) => ({
        field,
        count,
        examples: examples[field] || []
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalCorrections: corrections.length,
      patterns
    };
  }
}
