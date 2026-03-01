import * as cron from 'node-cron';
import { maintenanceService } from '../services/maintenance/maintenance.service';
import { mergeService } from '../services/maintenance/merge.service';
import { MaintenanceStatus } from '@prisma/client';

/**
 * 任务执行状态跟踪
 * 用于防止任务重叠执行
 */
interface TaskExecutionState {
  isRunning: boolean;
  lastRunAt: Date | null;
  lastRunDuration: number;
  lastError: string | null;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
}

/**
 * 任务配置常量
 */
const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30分钟超时

/**
 * 定时任务配置接口
 */
interface CronJobConfig {
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
}

/**
 * 定时任务调度器
 *
 * 管理 CapsulaAI 的维护相关定时任务:
 * 1. 每日扫描任务 (daily-scan) - 每天凌晨 2:00
 * 2. 自动批准任务 (auto-approve) - 每小时
 * 3. 过期任务清理 (cleanup) - 每周日凌晨 3:00
 * 4. 健康报告生成 (health-report) - 每天上午 9:00
 */
export class MaintenanceJobScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private executionStates: Map<string, TaskExecutionState> = new Map();
  private userId: string;

  // 任务配置
  private readonly jobConfigs: CronJobConfig[] = [
    {
      name: 'daily-scan',
      schedule: '0 2 * * *', // 每天凌晨 2:00
      description: '每日扫描任务: 扫描重复实体、发现新关系、检测过时实体、检测孤立节点',
      enabled: true,
    },
    {
      name: 'auto-approve',
      schedule: '0 * * * *', // 每小时
      description: '自动批准任务: 自动批准置信度 >= 0.95 的任务并执行',
      enabled: true,
    },
    {
      name: 'cleanup',
      schedule: '0 3 * * 0', // 每周日凌晨 3:00
      description: '过期任务清理: 清理已拒绝超过 30 天的任务和已回滚超过 7 天的任务',
      enabled: true,
    },
    {
      name: 'health-report',
      schedule: '0 9 * * *', // 每天上午 9:00
      description: '健康报告生成: 生成知识图谱健康报告',
      enabled: true,
    },
  ];

  constructor(userId: string = 'system') {
    this.userId = userId;
    this.initializeExecutionStates();
  }

  /**
   * 初始化任务执行状态
   */
  private initializeExecutionStates(): void {
    for (const config of this.jobConfigs) {
      this.executionStates.set(config.name, {
        isRunning: false,
        lastRunAt: null,
        lastRunDuration: 0,
        lastError: null,
        totalRuns: 0,
        successRuns: 0,
        failedRuns: 0,
      });
    }
  }

  /**
   * 启动所有定时任务
   */
  startAll(): void {
    console.log('[MaintenanceJobScheduler] 启动所有定时任务...');

    for (const config of this.jobConfigs) {
      if (config.enabled) {
        this.startJob(config);
      }
    }

    console.log('[MaintenanceJobScheduler] 所有定时任务已启动');
  }

  /**
   * 停止所有定时任务
   */
  stopAll(): void {
    console.log('[MaintenanceJobScheduler] 停止所有定时任务...');

    for (const [name, job] of Array.from(this.jobs.entries())) {
      job.stop();
      console.log(`[MaintenanceJobScheduler] 任务 "${name}" 已停止`);
    }

    this.jobs.clear();

    // 重置所有执行状态
    for (const [name, state] of Array.from(this.executionStates.entries())) {
      state.isRunning = false;
      console.log(`[MaintenanceJobScheduler] 任务 "${name}" 执行状态已重置`);
    }

    console.log('[MaintenanceJobScheduler] 所有定时任务已停止');
  }

  /**
   * 启动单个任务
   */
  private startJob(config: CronJobConfig): void {
    const existingJob = this.jobs.get(config.name);
    if (existingJob) {
      existingJob.stop();
    }

    const task = cron.schedule(
      config.schedule,
      async () => {
        await this.executeJob(config.name);
      },
      {
        scheduled: true,
        timezone: 'Asia/Shanghai',
      }
    );

    this.jobs.set(config.name, task);
    console.log(`[MaintenanceJobScheduler] 任务 "${config.name}" 已启动 (${config.schedule}): ${config.description}`);
  }

  /**
   * 执行任务（带防重叠保护和超时控制）
   */
  private async executeJob(jobName: string): Promise<void> {
    const state = this.executionStates.get(jobName);

    if (!state) {
      console.error(`[MaintenanceJobScheduler] 未知任务: ${jobName}`);
      return;
    }

    // 检查是否正在运行
    if (state.isRunning) {
      console.warn(`[MaintenanceJobScheduler] 任务 "${jobName}" 正在运行中，跳过本次执行`);
      return;
    }

    const startTime = Date.now();
    state.isRunning = true;
    state.lastError = null;
    state.totalRuns++;

    console.log(`[MaintenanceJobScheduler] 任务 "${jobName}" 开始执行`);

    // 创建超时 Promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`任务执行超时 (${JOB_TIMEOUT_MS}ms)`));
      }, JOB_TIMEOUT_MS);
    });

    try {
      // 执行任务并设置超时
      await Promise.race([
        this.executeJobLogic(jobName),
        timeoutPromise,
      ]);

      state.lastRunAt = new Date();
      state.lastRunDuration = Date.now() - startTime;
      state.successRuns++;
      console.log(`[MaintenanceJobScheduler] 任务 "${jobName}" 执行完成，耗时 ${state.lastRunDuration}ms`);
    } catch (error) {
      state.lastError = (error as Error).message;
      state.failedRuns++;
      console.error(`[MaintenanceJobScheduler] 任务 "${jobName}" 执行失败:`, error);
    } finally {
      state.isRunning = false;
    }
  }

  /**
   * 执行任务逻辑
   */
  private async executeJobLogic(jobName: string): Promise<void> {
    switch (jobName) {
      case 'daily-scan':
        await this.runDailyScan();
        break;
      case 'auto-approve':
        await this.runAutoApprove();
        break;
      case 'cleanup':
        await this.runCleanup();
        break;
      case 'health-report':
        await this.runHealthReport();
        break;
      default:
        throw new Error(`[MaintenanceJobScheduler] 未知任务类型: ${jobName}`);
    }
  }

  /**
   * 每日扫描任务
   * - 扫描重复实体
   * - 发现新关系
   * - 检测过时实体
   * - 检测孤立节点
   */
  private async runDailyScan(): Promise<void> {
    console.log('[MaintenanceJobScheduler] 开始每日扫描...');

    try {
      // 1. 扫描重复实体
      console.log('[MaintenanceJobScheduler] 扫描重复实体...');
      const duplicateTasks = await maintenanceService.scanForDuplicates(this.userId);
      console.log(`[MaintenanceJobScheduler] 发现 ${duplicateTasks.length} 个潜在重复实体`);

      // 2. 发现新关系
      console.log('[MaintenanceJobScheduler] 发现新关系...');
      const relationTasks = await maintenanceService.discoverRelations(this.userId);
      console.log(`[MaintenanceJobScheduler] 发现 ${relationTasks.length} 个新关系`);

      // 3. 检测过时实体
      console.log('[MaintenanceJobScheduler] 检测过时实体...');
      const staleTasks = await maintenanceService.detectStaleEntities(this.userId);
      console.log(`[MaintenanceJobScheduler] 发现 ${staleTasks.length} 个过时实体`);

      // 4. 检测孤立节点
      console.log('[MaintenanceJobScheduler] 检测孤立节点...');
      const orphanTasks = await maintenanceService.detectOrphanEntities(this.userId);
      console.log(`[MaintenanceJobScheduler] 发现 ${orphanTasks.length} 个孤立节点`);

      // 5. 标签优化
      console.log('[MaintenanceJobScheduler] 标签优化...');
      const tagTasks = await maintenanceService.optimizeTags(this.userId);
      console.log(`[MaintenanceJobScheduler] 发现 ${tagTasks.length} 个标签优化机会`);

      const totalTasks = duplicateTasks.length + relationTasks.length + staleTasks.length + orphanTasks.length + tagTasks.length;
      console.log(`[MaintenanceJobScheduler] 每日扫描完成，共创建 ${totalTasks} 个维护任务`);
    } catch (error) {
      console.error('[MaintenanceJobScheduler] 每日扫描失败:', error);
      throw error;
    }
  }

  /**
   * 自动批准任务
   * - 自动批准置信度 >= 0.95 的任务
   * - 自动执行已批准的任务
   */
  private async runAutoApprove(): Promise<void> {
    console.log('[MaintenanceJobScheduler] 开始自动批准任务...');

    try {
      // 获取所有等待审核的任务
      const { tasks: pendingTasks } = await maintenanceService.getTasks(this.userId, {
        status: MaintenanceStatus.AWAITING_USER_REVIEW,
        limit: 100,
      });

      // 筛选高置信度任务 (>= 0.95)
      const highConfidenceTasks = pendingTasks.filter(task => task.confidence >= 0.95);
      console.log(`[MaintenanceJobScheduler] 发现 ${highConfidenceTasks.length} 个高置信度任务`);

      // 自动批准高置信度任务
      const approvedTasks: string[] = [];
      for (const task of highConfidenceTasks) {
        try {
          await maintenanceService.approveTask(this.userId, task.id, '系统自动批准 (置信度 >= 0.95)');
          approvedTasks.push(task.id);
          console.log(`[MaintenanceJobScheduler] 任务 ${task.id} 已自动批准`);
        } catch (error) {
          console.error(`[MaintenanceJobScheduler] 批准任务 ${task.id} 失败:`, error);
        }
      }

      // 自动执行已批准的任务（包括 AUTO_APPROVED 和刚批准的 APPROVED）
      const { tasks: approvedTasksToExecute } = await maintenanceService.getTasks(this.userId, {
        status: MaintenanceStatus.AUTO_APPROVED,
        limit: 100,
      });

      const executedTasks: string[] = [];
      for (const task of approvedTasksToExecute) {
        try {
          const result = await maintenanceService.applyTask(this.userId, task.id);
          if (result.success) {
            executedTasks.push(task.id);
            console.log(`[MaintenanceJobScheduler] 任务 ${task.id} 已自动执行`);
          } else {
            console.error(`[MaintenanceJobScheduler] 执行任务 ${task.id} 失败:`, result.error);
          }
        } catch (error) {
          console.error(`[MaintenanceJobScheduler] 执行任务 ${task.id} 失败:`, error);
        }
      }

      console.log(`[MaintenanceJobScheduler] 自动批准完成: 批准 ${approvedTasks.length} 个任务，执行 ${executedTasks.length} 个任务`);
    } catch (error) {
      console.error('[MaintenanceJobScheduler] 自动批准任务失败:', error);
      throw error;
    }
  }

  /**
   * 过期任务清理
   * - 清理已拒绝超过 30 天的任务
   * - 清理已回滚超过 7 天的任务
   * 
   * 注意: 当前版本仅记录日志，不实际删除任务
   * 如需启用删除功能，需要先在 maintenanceService 中添加 deleteTask 方法
   */
  private async runCleanup(): Promise<void> {
    console.log('[MaintenanceJobScheduler] 开始过期任务清理检查...');
    console.log('[MaintenanceJobScheduler] 注意: 当前仅记录日志，不实际删除任务');

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 获取所有已拒绝和已回滚的任务
      const { tasks: rejectedTasks } = await maintenanceService.getTasks(this.userId, {
        status: MaintenanceStatus.REJECTED,
        limit: 1000,
      });

      const { tasks: revertedTasks } = await maintenanceService.getTasks(this.userId, {
        status: MaintenanceStatus.REVERTED,
        limit: 1000,
      });

      // 筛选需要清理的任务
      const tasksToDelete = [
        ...rejectedTasks.filter(task => new Date(task.updatedAt) < thirtyDaysAgo),
        ...revertedTasks.filter(task => new Date(task.updatedAt) < sevenDaysAgo),
      ];

      console.log(`[MaintenanceJobScheduler] 发现 ${tasksToDelete.length} 个过期任务需要清理`);

      // 记录需要清理的任务（实际删除功能暂未启用）
      for (const task of tasksToDelete) {
        const daysOld = Math.floor((now.getTime() - new Date(task.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
        console.log(`[MaintenanceJobScheduler] [待清理] 任务 ${task.id}: 类型=${task.taskType}, 状态=${task.status}, 已过期 ${daysOld} 天`);
      }

      console.log(`[MaintenanceJobScheduler] 过期任务清理检查完成，共标记 ${tasksToDelete.length} 个任务待清理（未实际删除）`);
    } catch (error) {
      console.error('[MaintenanceJobScheduler] 过期任务清理检查失败:', error);
      throw error;
    }
  }

  /**
   * 健康报告生成
   * - 生成知识图谱健康报告
   * - 发送通知（预留）
   */
  private async runHealthReport(): Promise<void> {
    console.log('[MaintenanceJobScheduler] 开始生成健康报告...');

    try {
      const report = await maintenanceService.getHealthReport(this.userId);

      console.log('[MaintenanceJobScheduler] ===== 知识图谱健康报告 =====');
      console.log(`[MaintenanceJobScheduler] 健康评分: ${report.score}/100`);
      console.log(`[MaintenanceJobScheduler] 总实体数: ${report.totalEntities}`);
      console.log(`[MaintenanceJobScheduler] 总关系数: ${report.totalRelations}`);
      console.log(`[MaintenanceJobScheduler] 孤立实体数: ${report.orphanEntities}`);
      console.log(`[MaintenanceJobScheduler] 潜在重复数: ${report.potentialDuplicates}`);
      console.log(`[MaintenanceJobScheduler] 过时实体数: ${report.staleEntities}`);
      console.log(`[MaintenanceJobScheduler] 损坏关系数: ${report.brokenRelations}`);
      console.log('[MaintenanceJobScheduler] =============================');

      // TODO: 发送通知（预留）
      // 可以集成邮件、Slack、Webhook 等通知方式
      if (report.score < 80) {
        console.warn(`[MaintenanceJobScheduler] 健康评分较低 (${report.score})，建议进行维护`);
        // await this.sendNotification('health-alert', report);
      }

      console.log('[MaintenanceJobScheduler] 健康报告生成完成');
    } catch (error) {
      console.error('[MaintenanceJobScheduler] 健康报告生成失败:', error);
      throw error;
    }
  }

  /**
   * 手动触发任务
   * @param jobName 任务名称
   */
  async triggerJob(jobName: string): Promise<void> {
    console.log(`[MaintenanceJobScheduler] 手动触发任务: ${jobName}`);
    await this.executeJob(jobName);
  }

  /**
   * 获取任务状态
   */
  getJobStatus(): Array<{
    name: string;
    schedule: string;
    description: string;
    enabled: boolean;
    isRunning: boolean;
    lastRunAt: Date | null;
    lastRunDuration: number;
    lastError: string | null;
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    successRate: number;
  }> {
    return this.jobConfigs.map(config => {
      const state = this.executionStates.get(config.name);
      const totalRuns = state?.totalRuns ?? 0;
      const successRuns = state?.successRuns ?? 0;
      const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0;
      
      return {
        name: config.name,
        schedule: config.schedule,
        description: config.description,
        enabled: config.enabled,
        isRunning: state?.isRunning ?? false,
        lastRunAt: state?.lastRunAt ?? null,
        lastRunDuration: state?.lastRunDuration ?? 0,
        lastError: state?.lastError ?? null,
        totalRuns,
        successRuns,
        failedRuns: state?.failedRuns ?? 0,
        successRate,
      };
    });
  }

  /**
   * 启用/禁用任务
   */
  setJobEnabled(jobName: string, enabled: boolean): void {
    const config = this.jobConfigs.find(c => c.name === jobName);
    if (!config) {
      console.error(`[MaintenanceJobScheduler] 未知任务: ${jobName}`);
      return;
    }

    config.enabled = enabled;

    if (enabled) {
      this.startJob(config);
    } else {
      const job = this.jobs.get(jobName);
      if (job) {
        job.stop();
        this.jobs.delete(jobName);
        
        // 重置执行状态
        const state = this.executionStates.get(jobName);
        if (state) {
          state.isRunning = false;
        }
        
        console.log(`[MaintenanceJobScheduler] 任务 "${jobName}" 已禁用`);
      }
    }
  }
}

// 默认调度器实例
let defaultScheduler: MaintenanceJobScheduler | null = null;
let initPromise: Promise<MaintenanceJobScheduler> | null = null;

/**
 * 初始化并启动定时任务调度器（线程安全）
 */
export async function initializeMaintenanceJobs(userId: string = 'system'): Promise<MaintenanceJobScheduler> {
  // 如果正在初始化，返回现有的 Promise
  if (initPromise) {
    console.log('[MaintenanceJobScheduler] 初始化正在进行中，等待完成...');
    return initPromise;
  }

  // 创建新的初始化 Promise
  initPromise = (async () => {
    try {
      if (defaultScheduler) {
        console.log('[MaintenanceJobScheduler] 调度器已存在，停止旧实例');
        defaultScheduler.stopAll();
      }

      defaultScheduler = new MaintenanceJobScheduler(userId);
      defaultScheduler.startAll();

      console.log('[MaintenanceJobScheduler] 调度器初始化完成');
      return defaultScheduler;
    } catch (error) {
      console.error('[MaintenanceJobScheduler] 初始化失败:', error);
      throw error;
    } finally {
      // 重置初始化 Promise，允许后续重新初始化
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * 获取默认调度器实例
 */
export function getMaintenanceJobScheduler(): MaintenanceJobScheduler | null {
  return defaultScheduler;
}

/**
 * 停止定时任务调度器
 */
export function stopMaintenanceJobs(): void {
  if (defaultScheduler) {
    defaultScheduler.stopAll();
    defaultScheduler = null;
  }
}

/**
 * 手动触发任务
 */
export async function triggerMaintenanceJob(jobName: string): Promise<void> {
  if (!defaultScheduler) {
    throw new Error('调度器未初始化');
  }
  await defaultScheduler.triggerJob(jobName);
}

/**
 * 获取任务状态
 */
export function getMaintenanceJobStatus(): Array<{
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  isRunning: boolean;
  lastRunAt: Date | null;
  lastRunDuration: number;
  lastError: string | null;
}> {
  if (!defaultScheduler) {
    return [];
  }
  return defaultScheduler.getJobStatus();
}
