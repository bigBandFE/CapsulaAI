// routes/review.ts
// 维护任务审查路由 - 用于审核知识图谱维护任务

import { Router } from 'express';
import { maintenanceService } from '../services/maintenance/maintenance.service';
import { prisma } from '../lib/prisma';
import { MaintenanceStatus, MaintenanceType } from '@prisma/client';
import { z } from 'zod';

const router = Router();

// Helper to get userId from request (预留认证中间件)
const getUserId = (req: any): string => {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) {
    throw new Error('Unauthorized: User ID is required');
  }
  return userId as string;
};

// Validation schemas
const approveReviewSchema = z.object({
  comment: z.string().optional(),
});

const rejectReviewSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

/**
 * GET /api/review/queue
 * 获取待审查队列
 * 
 * Query params:
 * - status: 状态过滤 (PENDING, AWAITING_USER_REVIEW, AUTO_APPROVED)
 * - taskType: 任务类型过滤
 * - limit: 每页数量 (默认 20)
 * - offset: 偏移量 (默认 0)
 */
router.get('/queue', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { 
      status = 'AWAITING_USER_REVIEW',
      taskType,
      limit = '20',
      offset = '0',
      minConfidence,
      maxConfidence,
    } = req.query;

    const where: any = { 
      userId,
      status: status as MaintenanceStatus,
    };

    if (taskType) {
      where.taskType = taskType as MaintenanceType;
    }

    if (minConfidence || maxConfidence) {
      where.confidence = {};
      if (minConfidence) where.confidence.gte = parseFloat(minConfidence as string);
      if (maxConfidence) where.confidence.lte = parseFloat(maxConfidence as string);
    }

    const [tasks, total] = await Promise.all([
      prisma.maintenanceTask.findMany({
        where,
        orderBy: [
          { confidence: 'desc' },
          { createdAt: 'desc' },
        ],
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.maintenanceTask.count({ where }),
    ]);

    res.json({
      success: true,
      data: tasks,
      meta: {
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error) {
    console.error('Error getting review queue:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get review queue',
      },
    });
  }
});

/**
 * GET /api/review/:id
 * 获取单个审查项详情
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const task = await prisma.maintenanceTask.findFirst({
      where: { id, userId },
    });

    if (!task) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Review item not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Error getting review item:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get review item',
      },
    });
  }
});

/**
 * POST /api/review/:id/approve
 * 批准审查项
 * 
 * Body:
 * - comment: 可选的审核意见
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { comment } = approveReviewSchema.parse(req.body);

    const task = await maintenanceService.approveTask(userId, id, comment);

    res.json({
      success: true,
      data: task,
      message: 'Review item approved successfully',
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

    if ((error as Error).message === '任务不存在') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Review item not found',
        },
      });
      return;
    }

    if ((error as Error).message.includes('无法批准')) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: (error as Error).message,
        },
      });
      return;
    }

    console.error('Error approving review item:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to approve review item',
      },
    });
  }
});

/**
 * POST /api/review/:id/reject
 * 拒绝审查项
 * 
 * Body:
 * - reason: 拒绝原因 (必填)
 */
router.post('/:id/reject', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { reason } = rejectReviewSchema.parse(req.body);

    const task = await maintenanceService.rejectTask(userId, id, reason);

    res.json({
      success: true,
      data: task,
      message: 'Review item rejected successfully',
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

    if ((error as Error).message === '任务不存在') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Review item not found',
        },
      });
      return;
    }

    if ((error as Error).message.includes('无法拒绝')) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: (error as Error).message,
        },
      });
      return;
    }

    console.error('Error rejecting review item:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reject review item',
      },
    });
  }
});

/**
 * POST /api/review/:id/apply
 * 执行审查项（在批准后执行）
 */
router.post('/:id/apply', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const result = await maintenanceService.applyTask(userId, id);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'APPLY_FAILED',
          message: result.error || 'Failed to apply review item',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: result.task,
      message: 'Review item applied successfully',
    });
  } catch (error) {
    console.error('Error applying review item:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to apply review item',
      },
    });
  }
});

/**
 * GET /api/review/stats
 * 获取审查统计
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = getUserId(req);

    // 获取各种状态的统计
    const [
      totalPending,
      totalAwaitingReview,
      totalAutoApproved,
      totalApproved,
      totalApplied,
      totalRejected,
      totalFailed,
      totalReverted,
    ] = await Promise.all([
      prisma.maintenanceTask.count({
        where: { userId, status: MaintenanceStatus.PENDING },
      }),
      prisma.maintenanceTask.count({
        where: { userId, status: MaintenanceStatus.AWAITING_USER_REVIEW },
      }),
      prisma.maintenanceTask.count({
        where: { userId, status: MaintenanceStatus.AUTO_APPROVED },
      }),
      prisma.maintenanceTask.count({
        where: { userId, status: MaintenanceStatus.APPROVED },
      }),
      prisma.maintenanceTask.count({
        where: { userId, status: MaintenanceStatus.APPLIED },
      }),
      prisma.maintenanceTask.count({
        where: { userId, status: MaintenanceStatus.REJECTED },
      }),
      prisma.maintenanceTask.count({
        where: { userId, status: MaintenanceStatus.FAILED },
      }),
      prisma.maintenanceTask.count({
        where: { userId, status: MaintenanceStatus.REVERTED },
      }),
    ]);

    // 按任务类型统计
    const taskTypeStats = await prisma.maintenanceTask.groupBy({
      by: ['taskType'],
      where: { userId },
      _count: { id: true },
    });

    // 按置信度分布统计
    const highConfidence = await prisma.maintenanceTask.count({
      where: { userId, confidence: { gte: 0.9 } },
    });
    const mediumConfidence = await prisma.maintenanceTask.count({
      where: { userId, confidence: { gte: 0.7, lt: 0.9 } },
    });
    const lowConfidence = await prisma.maintenanceTask.count({
      where: { userId, confidence: { lt: 0.7 } },
    });

    // 今日统计
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayApproved = await prisma.maintenanceTask.count({
      where: { 
        userId, 
        status: MaintenanceStatus.APPROVED,
        reviewedAt: { gte: today },
      },
    });

    const todayApplied = await prisma.maintenanceTask.count({
      where: { 
        userId, 
        status: MaintenanceStatus.APPLIED,
        appliedAt: { gte: today },
      },
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalPending,
          totalAwaitingReview,
          totalAutoApproved,
          totalApproved,
          totalApplied,
          totalRejected,
          totalFailed,
          totalReverted,
          totalTasks: totalPending + totalAwaitingReview + totalAutoApproved + 
                      totalApproved + totalApplied + totalRejected + totalFailed + totalReverted,
        },
        byType: taskTypeStats.map((stat) => ({
          type: stat.taskType,
          count: stat._count.id,
        })),
        byConfidence: {
          high: highConfidence,
          medium: mediumConfidence,
          low: lowConfidence,
        },
        today: {
          approved: todayApproved,
          applied: todayApplied,
        },
        requiresAction: totalAwaitingReview + totalAutoApproved,
      },
    });
  } catch (error) {
    console.error('Error getting review stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get review stats',
      },
    });
  }
});

/**
 * POST /api/review/batch-approve
 * 批量批准审查项
 * 
 * Body:
 * - ids: 任务ID数组
 * - comment: 可选的审核意见
 */
router.post('/batch-approve', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { ids, comment } = z.object({
      ids: z.array(z.string()).min(1).max(100, 'Cannot process more than 100 items at once'),
      comment: z.string().optional(),
    }).parse(req.body);

    const results = await Promise.allSettled(
      ids.map(id => maintenanceService.approveTask(userId, id, comment))
    );

    const successful = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r, index) => ({ id: ids[index], reason: r.reason?.message }));

    res.json({
      success: true,
      data: {
        successful,
        failed,
        totalProcessed: ids.length,
        successCount: successful.length,
        failureCount: failed.length,
      },
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

    console.error('Error batch approving review items:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to batch approve review items',
      },
    });
  }
});

/**
 * POST /api/review/batch-reject
 * 批量拒绝审查项
 * 
 * Body:
 * - ids: 任务ID数组
 * - reason: 拒绝原因 (必填)
 */
router.post('/batch-reject', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { ids, reason } = z.object({
      ids: z.array(z.string()).min(1).max(100, 'Cannot process more than 100 items at once'),
      reason: z.string().min(1),
    }).parse(req.body);

    const results = await Promise.allSettled(
      ids.map(id => maintenanceService.rejectTask(userId, id, reason))
    );

    const successful = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r, index) => ({ id: ids[index], reason: r.reason?.message }));

    res.json({
      success: true,
      data: {
        successful,
        failed,
        totalProcessed: ids.length,
        successCount: successful.length,
        failureCount: failed.length,
      },
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

    console.error('Error batch rejecting review items:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to batch reject review items',
      },
    });
  }
});

export default router;
