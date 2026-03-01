// routes/maintenance/maintenance.routes.ts

import { Router } from 'express';
import { maintenanceService } from '../../services/maintenance/maintenance.service';
import { z } from 'zod';

const router = Router();

// Helper to get userId from request
const getUserId = (req: any): string => {
  return req.user?.id || req.headers['x-user-id'] as string || 'test-user';
};

// Validation schemas
const approveTaskSchema = z.object({
  comment: z.string().optional(),
});

// GET /api/maintenance/health - Get health report
router.get('/health', async (req, res) => {
  try {
    const userId = getUserId(req);
    const report = await maintenanceService.getHealthReport(userId);

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Error getting health report:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get health report',
      },
    });
  }
});

// GET /api/maintenance/tasks - Get maintenance tasks
router.get('/tasks', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { status, taskType, limit = '50', offset = '0' } = req.query;

    const result = await maintenanceService.getTasks(userId, {
      status: status as any,
      taskType: taskType as any,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({
      success: true,
      data: result.tasks,
      meta: {
        pagination: {
          total: result.total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get tasks',
      },
    });
  }
});

// GET /api/maintenance/tasks/:id - Get a single task
router.get('/tasks/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const task = await maintenanceService.getTask(userId, id);

    if (!task) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get task',
      },
    });
  }
});

// POST /api/maintenance/tasks/:id/approve - Approve a task
router.post('/tasks/:id/approve', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { comment } = approveTaskSchema.parse(req.body);

    const task = await maintenanceService.approveTask(userId, id, comment);

    res.json({
      success: true,
      data: task,
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
    if ((error as Error).message === 'Task not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found',
        },
      });
      return;
    }
    console.error('Error approving task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to approve task',
      },
    });
  }
});

// POST /api/maintenance/tasks/:id/reject - Reject a task
router.post('/tasks/:id/reject', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { comment } = approveTaskSchema.parse(req.body);

    const task = await maintenanceService.rejectTask(userId, id, comment);

    res.json({
      success: true,
      data: task,
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
    if ((error as Error).message === 'Task not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found',
        },
      });
      return;
    }
    console.error('Error rejecting task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reject task',
      },
    });
  }
});

// POST /api/maintenance/tasks/:id/apply - Apply an approved task
router.post('/tasks/:id/apply', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const task = await maintenanceService.applyTask(userId, id);

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    if ((error as Error).message === 'Task not found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found',
        },
      });
      return;
    }
    if ((error as Error).message === 'Task not approved') {
      res.status(400).json({
        success: false,
        error: {
          code: 'NOT_APPROVED',
          message: 'Task not approved',
        },
      });
      return;
    }
    console.error('Error applying task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to apply task',
      },
    });
  }
});

// POST /api/maintenance/scan - Run full maintenance scan
router.post('/scan', async (req, res) => {
  try {
    const userId = getUserId(req);

    const result = await maintenanceService.runFullScan(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error running scan:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to run scan',
      },
    });
  }
});

// POST /api/maintenance/scan/duplicates - Scan for duplicates only
router.post('/scan/duplicates', async (req, res) => {
  try {
    const userId = getUserId(req);

    const tasks = await maintenanceService.scanForDuplicates(userId);

    res.json({
      success: true,
      data: { count: tasks.length, tasks },
    });
  } catch (error) {
    console.error('Error scanning duplicates:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to scan duplicates',
      },
    });
  }
});

// POST /api/maintenance/scan/relations - Discover relations only
router.post('/scan/relations', async (req, res) => {
  try {
    const userId = getUserId(req);

    const tasks = await maintenanceService.discoverRelations(userId);

    res.json({
      success: true,
      data: { count: tasks.length, tasks },
    });
  } catch (error) {
    console.error('Error discovering relations:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to discover relations',
      },
    });
  }
});

// GET /api/maintenance/stats - Get maintenance statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = getUserId(req);

    const [
      totalTasks,
      pendingTasks,
      approvedTasks,
      appliedTasks,
      rejectedTasks,
    ] = await Promise.all([
      // Note: These would need to be implemented with actual Prisma queries
      Promise.resolve(0),
      Promise.resolve(0),
      Promise.resolve(0),
      Promise.resolve(0),
      Promise.resolve(0),
    ]);

    res.json({
      success: true,
      data: {
        totalTasks,
        pendingTasks,
        approvedTasks,
        appliedTasks,
        rejectedTasks,
      },
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

export default router;
