import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// 从 Prisma 客户端导入枚举类型
import {
  MaintenanceTask,
  MaintenanceType,
  MaintenanceStatus,
  ReviewerType,
} from '@prisma/client';

import { similarityService, EntityData } from './similarity.service';

/**
 * 自动批准置信度阈值
 * 当置信度 >= 0.95 时，任务将自动批准
 */
const AUTO_APPROVE_THRESHOLD = 0.95;

/**
 * 维护任务变更记录接口
 */
export interface MaintenanceChange {
  /** 变更字段 */
  field: string;
  /** 旧值 */
  oldValue?: unknown;
  /** 新值 */
  newValue?: unknown;
}

/**
 * 创建维护任务输入接口
 */
export interface CreateTaskInput {
  /** 任务类型 */
  taskType: MaintenanceType;
  /** 任务描述 */
  description: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 源实体ID */
  sourceEntityId?: string;
  /** 目标实体ID */
  targetEntityId?: string;
  /** 关系ID */
  relationId?: string;
  /** 变更内容 */
  changes?: MaintenanceChange[];
}

/**
 * 健康报告接口
 */
export interface HealthReport {
  /** 健康评分 (0-100) */
  score: number;
  /** 总实体数 */
  totalEntities: number;
  /** 总关系数 */
  totalRelations: number;
  /** 孤立实体数 */
  orphanEntities: number;
  /** 潜在重复数 */
  potentialDuplicates: number;
  /** 过时实体数 */
  staleEntities: number;
  /** 损坏关系数 */
  brokenRelations: number;
  /** 详细信息 */
  details: {
    orphanEntities: string[];
    potentialDuplicates: Array<{
      entityAId: string;
      entityBId: string;
      similarity: number;
    }>;
    staleEntities: string[];
    brokenRelations: string[];
  };
}

/**
 * 任务执行结果接口
 */
export interface TaskExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 执行后的任务 */
  task?: MaintenanceTask;
  /** 错误信息 */
  error?: string;
}

/**
 * JSON 对象类型
 */
type JsonObject = Record<string, unknown>;

/**
 * 维护任务服务
 *
 * 提供知识图谱维护任务的完整生命周期管理:
 * - 任务创建
 * - 状态机管理 (PENDING → AUTO_APPROVED/APPROVED/REJECTED → APPLIED)
 * - 自动批准 (confidence >= 0.95)
 * - 任务执行 (实体合并、关系发现等)
 * - 任务回滚
 *
 * 状态机:
 * ```
 * PENDING → auto_check(confidence>=0.95) → AUTO_APPROVED → apply → APPLIED
 * PENDING → auto_check(confidence<0.95) → AWAITING_USER_REVIEW → approve → APPROVED → apply → APPLIED
 * AWAITING_USER_REVIEW → reject → REJECTED
 * APPLIED → revert → REVERTED
 * ```
 */
export class MaintenanceService {
  /**
   * 创建维护任务
   *
   * 根据置信度自动决定任务状态:
   * - confidence >= 0.95: AUTO_APPROVED (自动批准)
   * - confidence < 0.95: AWAITING_USER_REVIEW (等待用户审核)
   *
   * @param userId - 用户ID
   * @param input - 任务创建输入
   * @returns 创建的维护任务
   */
  async createTask(
    userId: string,
    input: CreateTaskInput
  ): Promise<MaintenanceTask> {
    // 确定初始状态
    let initialStatus: MaintenanceStatus;
    let reviewedBy: ReviewerType | null = null;
    let reviewedAt: Date | null = null;

    if (input.confidence >= AUTO_APPROVE_THRESHOLD) {
      initialStatus = MaintenanceStatus.AUTO_APPROVED;
      reviewedBy = ReviewerType.SYSTEM;
      reviewedAt = new Date();
    } else {
      initialStatus = MaintenanceStatus.AWAITING_USER_REVIEW;
    }

    return prisma.maintenanceTask.create({
      data: {
        userId,
        taskType: input.taskType,
        description: input.description,
        confidence: input.confidence,
        sourceEntityId: input.sourceEntityId,
        targetEntityId: input.targetEntityId,
        relationId: input.relationId,
        status: initialStatus,
        reviewedBy,
        reviewedAt,
        changes: input.changes as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 批量创建维护任务
   *
   * 使用事务保证原子性，如果任一任务创建失败，所有任务都不会创建
   *
   * @param userId - 用户ID
   * @param inputs - 任务创建输入列表
   * @returns 创建的维护任务列表
   * @throws Error 当任一任务创建失败时，所有任务都会被回滚
   */
  async createTasks(
    userId: string,
    inputs: CreateTaskInput[]
  ): Promise<MaintenanceTask[]> {
    // 使用事务保证原子性
    return prisma.$transaction(async (tx) => {
      const tasks: MaintenanceTask[] = [];

      for (const input of inputs) {
        // 确定初始状态
        let initialStatus: MaintenanceStatus;
        let reviewedBy: ReviewerType | null = null;
        let reviewedAt: Date | null = null;

        if (input.confidence >= AUTO_APPROVE_THRESHOLD) {
          initialStatus = MaintenanceStatus.AUTO_APPROVED;
          reviewedBy = ReviewerType.SYSTEM;
          reviewedAt = new Date();
        } else {
          initialStatus = MaintenanceStatus.AWAITING_USER_REVIEW;
        }

        const task = await tx.maintenanceTask.create({
          data: {
            userId,
            taskType: input.taskType,
            description: input.description,
            confidence: input.confidence,
            sourceEntityId: input.sourceEntityId,
            targetEntityId: input.targetEntityId,
            relationId: input.relationId,
            status: initialStatus,
            reviewedBy,
            reviewedAt,
            changes: input.changes as unknown as Prisma.InputJsonValue,
          },
        });

        tasks.push(task);
      }

      return tasks;
    });
  }

  /**
   * 扫描实体重复项
   *
   * 使用相似度服务查找潜在的重复实体，并创建合并任务
   *
   * @param userId - 用户ID
   * @param similarityThreshold - 相似度阈值 (默认 0.85)
   * @returns 创建的维护任务列表
   */
  async scanForDuplicates(
    userId: string,
    similarityThreshold = 0.85
  ): Promise<MaintenanceTask[]> {
    // 获取所有实体
    const entities = await prisma.entity.findMany({
      include: {
        relationsFrom: { select: { toEntityId: true } },
        relationsTo: { select: { fromEntityId: true } },
      },
    });

    // 转换为 EntityData 格式
    // 注意: embedding 字段是 Unsupported("vector(1536)") 类型，无法直接通过 Prisma 获取
    // 需要通过原始查询或单独的向量服务获取
    const entityData: EntityData[] = entities.map((e) => ({
      id: e.id,
      name: e.canonicalName,
      type: e.type,
      aliases: [],
      embedding: undefined, // 向量需要通过其他方式获取
      relatedEntities: [
        ...e.relationsFrom.map((r) => r.toEntityId),
        ...e.relationsTo.map((r) => r.fromEntityId),
      ],
    }));

    // 查找相似实体对
    const similarPairs = await similarityService.findSimilarPairs(
      entityData,
      similarityThreshold
    );

    // 创建维护任务
    const tasks: MaintenanceTask[] = [];

    for (const pair of similarPairs) {
      // 检查是否已存在相同任务
      const existing = await prisma.maintenanceTask.findFirst({
        where: {
          userId,
          taskType: MaintenanceType.ENTITY_MERGE,
          sourceEntityId: pair.entityA.id,
          targetEntityId: pair.entityB.id,
          status: {
            in: [
              MaintenanceStatus.PENDING,
              MaintenanceStatus.AWAITING_USER_REVIEW,
              MaintenanceStatus.AUTO_APPROVED,
            ],
          },
        },
      });

      if (existing) continue;

      const task = await this.createTask(userId, {
        taskType: MaintenanceType.ENTITY_MERGE,
        description: `合并实体 "${pair.entityA.name}" 和 "${pair.entityB.name}" (相似度: ${Math.round(
          pair.similarity * 100
        )}%)`,
        confidence: pair.similarity,
        sourceEntityId: pair.entityA.id,
        targetEntityId: pair.entityB.id,
        changes: [
          {
            field: 'entityAName',
            oldValue: null,
            newValue: pair.entityA.name,
          },
          {
            field: 'entityBName',
            oldValue: null,
            newValue: pair.entityB.name,
          },
          {
            field: 'similarity',
            oldValue: null,
            newValue: pair.similarity,
          },
        ],
      });

      tasks.push(task);
    }

    return tasks;
  }

  /**
   * 发现新关系
   *
   * 查找在多个胶囊中共同出现的实体对，建议创建关系
   *
   * @param userId - 用户ID
   * @param coOccurrenceThreshold - 共现阈值 (默认 2)
   * @returns 创建的维护任务列表
   */
  async discoverRelations(
    userId: string,
    coOccurrenceThreshold = 2
  ): Promise<MaintenanceTask[]> {
    const tasks: MaintenanceTask[] = [];

    // 查找在胶囊中共同出现的实体对
    const coOccurrences = await prisma.$queryRaw<
      Array<{
        entity1_id: string;
        entity2_id: string;
        co_occurrence_count: number;
      }>
    >`
      SELECT 
        ce1.entity_id as entity1_id,
        ce2.entity_id as entity2_id,
        COUNT(*) as co_occurrence_count
      FROM "CapsuleEntity" ce1
      JOIN "CapsuleEntity" ce2 ON ce1.capsule_id = ce2.capsule_id
      WHERE ce1.entity_id < ce2.entity_id
      GROUP BY ce1.entity_id, ce2.entity_id
      HAVING COUNT(*) >= ${coOccurrenceThreshold}
    `;

    for (const co of coOccurrences) {
      // 检查关系是否已存在
      const existingRelation = await prisma.relation.findFirst({
        where: {
          OR: [
            { fromEntityId: co.entity1_id, toEntityId: co.entity2_id },
            { fromEntityId: co.entity2_id, toEntityId: co.entity1_id },
          ],
        },
      });

      if (existingRelation) continue;

      // 检查任务是否已存在
      const existingTask = await prisma.maintenanceTask.findFirst({
        where: {
          userId,
          taskType: MaintenanceType.RELATION_DISCOVERY,
          sourceEntityId: co.entity1_id,
          targetEntityId: co.entity2_id,
          status: {
            in: [
              MaintenanceStatus.PENDING,
              MaintenanceStatus.AWAITING_USER_REVIEW,
              MaintenanceStatus.AUTO_APPROVED,
            ],
          },
        },
      });

      if (existingTask) continue;

      const entityA = await prisma.entity.findUnique({
        where: { id: co.entity1_id },
      });
      const entityB = await prisma.entity.findUnique({
        where: { id: co.entity2_id },
      });

      if (!entityA || !entityB) continue;

      // 根据共现次数计算置信度
      const confidence = Math.min(0.95, 0.5 + co.co_occurrence_count * 0.1);

      const task = await this.createTask(userId, {
        taskType: MaintenanceType.RELATION_DISCOVERY,
        description: `在 "${entityA.canonicalName}" 和 "${entityB.canonicalName}" 之间创建关系 (${co.co_occurrence_count} 次共现)`,
        confidence,
        sourceEntityId: co.entity1_id,
        targetEntityId: co.entity2_id,
        changes: [
          {
            field: 'entityAName',
            oldValue: null,
            newValue: entityA.canonicalName,
          },
          {
            field: 'entityBName',
            oldValue: null,
            newValue: entityB.canonicalName,
          },
          {
            field: 'coOccurrenceCount',
            oldValue: null,
            newValue: co.co_occurrence_count,
          },
          {
            field: 'suggestedRelationType',
            oldValue: null,
            newValue: 'RELATED_TO',
          },
        ],
      });

      tasks.push(task);
    }

    return tasks;
  }

  /**
   * 检测过时实体
   *
   * 查找长时间未被提及的实体
   *
   * @param userId - 用户ID
   * @param daysThreshold - 天数阈值 (默认 90 天)
   * @returns 创建的维护任务列表
   */
  async detectStaleEntities(
    userId: string,
    daysThreshold = 90
  ): Promise<MaintenanceTask[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

    const staleEntities = await prisma.entity.findMany({
      where: {
        lastSeenAt: { lt: thresholdDate },
      },
    });

    const tasks: MaintenanceTask[] = [];

    for (const entity of staleEntities) {
      // 检查任务是否已存在
      const existing = await prisma.maintenanceTask.findFirst({
        where: {
          userId,
          taskType: MaintenanceType.STALE_DETECTION,
          sourceEntityId: entity.id,
          status: {
            in: [
              MaintenanceStatus.PENDING,
              MaintenanceStatus.AWAITING_USER_REVIEW,
              MaintenanceStatus.AUTO_APPROVED,
            ],
          },
        },
      });

      if (existing) continue;

      const daysSinceSeen = Math.floor(
        (Date.now() - entity.lastSeenAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const task = await this.createTask(userId, {
        taskType: MaintenanceType.STALE_DETECTION,
        description: `实体 "${entity.canonicalName}" 已 ${daysSinceSeen} 天未被提及`,
        confidence: 0.7,
        sourceEntityId: entity.id,
        changes: [
          {
            field: 'entityName',
            oldValue: null,
            newValue: entity.canonicalName,
          },
          {
            field: 'daysSinceSeen',
            oldValue: null,
            newValue: daysSinceSeen,
          },
          {
            field: 'lastSeenAt',
            oldValue: null,
            newValue: entity.lastSeenAt,
          },
        ],
      });

      tasks.push(task);
    }

    return tasks;
  }

  /**
   * 检测孤立实体
   *
   * 查找没有任何关系的实体
   *
   * @param userId - 用户ID
   * @returns 创建的维护任务列表
   */
  async detectOrphanEntities(userId: string): Promise<MaintenanceTask[]> {
    const orphanEntities = await prisma.entity.findMany({
      where: {
        AND: [{ relationsFrom: { none: {} } }, { relationsTo: { none: {} } }],
      },
    });

    const tasks: MaintenanceTask[] = [];

    for (const entity of orphanEntities) {
      // 检查任务是否已存在
      const existing = await prisma.maintenanceTask.findFirst({
        where: {
          userId,
          taskType: MaintenanceType.ORPHAN_CLEANUP,
          sourceEntityId: entity.id,
          status: {
            in: [
              MaintenanceStatus.PENDING,
              MaintenanceStatus.AWAITING_USER_REVIEW,
              MaintenanceStatus.AUTO_APPROVED,
            ],
          },
        },
      });

      if (existing) continue;

      const task = await this.createTask(userId, {
        taskType: MaintenanceType.ORPHAN_CLEANUP,
        description: `实体 "${entity.canonicalName}" 没有任何关系`,
        confidence: 0.6,
        sourceEntityId: entity.id,
        changes: [
          {
            field: 'entityName',
            oldValue: null,
            newValue: entity.canonicalName,
          },
          {
            field: 'entityType',
            oldValue: null,
            newValue: entity.type,
          },
        ],
      });

      tasks.push(task);
    }

    return tasks;
  }

  /**
   * 优化标签
   *
   * 查找并合并相似的标签
   *
   * @param userId - 用户ID
   * @returns 创建的维护任务列表
   */
  async optimizeTags(userId: string): Promise<MaintenanceTask[]> {
    // 获取所有标签
    const tags = await prisma.tag.findMany({
      include: {
        capsuleTags: true,
      },
    });

    const tasks: MaintenanceTask[] = [];

    // 查找相似标签
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const tagA = tags[i];
        const tagB = tags[j];

        // 计算标签名称相似度
        const similarity = similarityService.calculateNameSimilarity(
          tagA.name,
          tagB.name
        );

        if (similarity >= 0.9) {
          // 检查任务是否已存在（检查具体的标签对）
          const existing = await prisma.maintenanceTask.findFirst({
            where: {
              userId,
              taskType: MaintenanceType.TAG_OPTIMIZATION,
              status: {
                in: [
                  MaintenanceStatus.PENDING,
                  MaintenanceStatus.AWAITING_USER_REVIEW,
                  MaintenanceStatus.AUTO_APPROVED,
                ],
              },
              // 检查是否已存在相同标签对的任务
              OR: [
                {
                  changes: {
                    path: ['tagAId'],
                    equals: tagA.id,
                  },
                },
                {
                  changes: {
                    path: ['tagAId'],
                    equals: tagB.id,
                  },
                },
                {
                  changes: {
                    path: ['tagBId'],
                    equals: tagA.id,
                  },
                },
                {
                  changes: {
                    path: ['tagBId'],
                    equals: tagB.id,
                  },
                },
              ],
            },
          });

          if (existing) continue;

          const task = await this.createTask(userId, {
            taskType: MaintenanceType.TAG_OPTIMIZATION,
            description: `合并相似标签 "${tagA.name}" 和 "${tagB.name}" (相似度: ${Math.round(
              similarity * 100
            )}%)`,
            confidence: similarity,
            changes: [
              {
                field: 'tagAName',
                oldValue: null,
                newValue: tagA.name,
              },
              {
                field: 'tagBName',
                oldValue: null,
                newValue: tagB.name,
              },
              {
                field: 'tagAId',
                oldValue: null,
                newValue: tagA.id,
              },
              {
                field: 'tagBId',
                oldValue: null,
                newValue: tagB.id,
              },
              {
                field: 'tagAUsageCount',
                oldValue: null,
                newValue: tagA.capsuleTags.length,
              },
              {
                field: 'tagBUsageCount',
                oldValue: null,
                newValue: tagB.capsuleTags.length,
              },
            ],
          });

          tasks.push(task);
        }
      }
    }

    return tasks;
  }

  /**
   * 获取维护任务列表
   *
   * @param userId - 用户ID
   * @param options - 查询选项
   * @returns 任务列表和总数
   */
  async getTasks(
    userId: string,
    options: {
      status?: MaintenanceStatus;
      taskType?: MaintenanceType;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ tasks: MaintenanceTask[]; total: number }> {
    const { status, taskType, limit = 50, offset = 0 } = options;

    const where: Prisma.MaintenanceTaskWhereInput = { userId };

    if (status) {
      where.status = status;
    }

    if (taskType) {
      where.taskType = taskType;
    }

    const [tasks, total] = await Promise.all([
      prisma.maintenanceTask.findMany({
        where,
        orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.maintenanceTask.count({ where }),
    ]);

    return { tasks, total };
  }

  /**
   * 获取单个维护任务
   *
   * @param userId - 用户ID
   * @param taskId - 任务ID
   * @returns 维护任务或 null
   */
  async getTask(
    userId: string,
    taskId: string
  ): Promise<MaintenanceTask | null> {
    return prisma.maintenanceTask.findFirst({
      where: { id: taskId, userId },
    });
  }

  /**
   * 批准维护任务
   *
   * 将任务状态从 AWAITING_USER_REVIEW 转换为 APPROVED
   *
   * @param userId - 用户ID
   * @param taskId - 任务ID
   * @param comment - 审核意见 (可选)
   * @returns 更新后的任务
   * @throws Error 当任务不存在或状态不正确时
   */
  async approveTask(
    userId: string,
    taskId: string,
    comment?: string
  ): Promise<MaintenanceTask> {
    const task = await prisma.maintenanceTask.findFirst({
      where: { id: taskId, userId },
    });

    if (!task) {
      throw new Error('任务不存在');
    }

    // 验证状态转换
    const allowedStatuses: MaintenanceStatus[] = [
      MaintenanceStatus.AWAITING_USER_REVIEW,
      MaintenanceStatus.PENDING,
    ];

    if (!allowedStatuses.includes(task.status)) {
      throw new Error(`无法批准状态为 "${task.status}" 的任务`);
    }

    return prisma.maintenanceTask.update({
      where: { id: taskId },
      data: {
        status: MaintenanceStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: ReviewerType.USER,
        reviewComment: comment,
      },
    });
  }

  /**
   * 拒绝维护任务
   *
   * 将任务状态转换为 REJECTED
   *
   * @param userId - 用户ID
   * @param taskId - 任务ID
   * @param comment - 拒绝原因 (可选)
   * @returns 更新后的任务
   * @throws Error 当任务不存在或状态不正确时
   */
  async rejectTask(
    userId: string,
    taskId: string,
    comment?: string
  ): Promise<MaintenanceTask> {
    const task = await prisma.maintenanceTask.findFirst({
      where: { id: taskId, userId },
    });

    if (!task) {
      throw new Error('任务不存在');
    }

    // 验证状态转换
    const allowedStatuses: MaintenanceStatus[] = [
      MaintenanceStatus.AWAITING_USER_REVIEW,
      MaintenanceStatus.PENDING,
      MaintenanceStatus.AUTO_APPROVED,
    ];

    if (!allowedStatuses.includes(task.status)) {
      throw new Error(`无法拒绝状态为 "${task.status}" 的任务`);
    }

    return prisma.maintenanceTask.update({
      where: { id: taskId },
      data: {
        status: MaintenanceStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedBy: ReviewerType.USER,
        reviewComment: comment,
      },
    });
  }

  /**
   * 执行维护任务
   *
   * 根据任务类型执行相应的操作，使用事务保证数据一致性
   *
   * 状态转换: APPROVED | AUTO_APPROVED → APPLIED
   *
   * @param userId - 用户ID
   * @param taskId - 任务ID
   * @returns 执行结果
   */
  async applyTask(
    userId: string,
    taskId: string
  ): Promise<TaskExecutionResult> {
    const task = await prisma.maintenanceTask.findFirst({
      where: { id: taskId, userId },
    });

    if (!task) {
      return { success: false, error: '任务不存在' };
    }

    // 验证状态
    const allowedStatuses: MaintenanceStatus[] = [
      MaintenanceStatus.APPROVED,
      MaintenanceStatus.AUTO_APPROVED,
    ];

    if (!allowedStatuses.includes(task.status)) {
      return {
        success: false,
        error: `无法执行状态为 "${task.status}" 的任务，任务必须是 APPROVED 或 AUTO_APPROVED 状态`,
      };
    }

    try {
      // 使用事务执行操作
      const result = await prisma.$transaction(async (tx) => {
        // 记录执行前的状态快照
        const snapshot = await this.createSnapshot(tx, task);

        // 执行任务
        switch (task.taskType) {
          case MaintenanceType.ENTITY_MERGE:
            await this.executeEntityMerge(tx, task);
            break;
          case MaintenanceType.RELATION_DISCOVERY:
            await this.executeRelationDiscovery(tx, task);
            break;
          case MaintenanceType.TAG_OPTIMIZATION:
            await this.executeTagOptimization(tx, task);
            break;
          case MaintenanceType.STALE_DETECTION:
            await this.executeStaleDetection(tx, task);
            break;
          case MaintenanceType.ORPHAN_CLEANUP:
            await this.executeOrphanCleanup(tx, task);
            break;
          default:
            throw new Error(`未知的任务类型: ${task.taskType}`);
        }

        // 更新任务状态为已应用
        const currentChanges = (task.changes as JsonObject) || {};
        const updatedTask = await tx.maintenanceTask.update({
          where: { id: taskId },
          data: {
            status: MaintenanceStatus.APPLIED,
            appliedAt: new Date(),
            changes: {
              ...currentChanges,
              _snapshot: snapshot,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        return updatedTask;
      });

      return { success: true, task: result };
    } catch (error) {
      // 更新任务状态为失败
      const failedTask = await prisma.maintenanceTask.update({
        where: { id: taskId },
        data: {
          status: MaintenanceStatus.FAILED,
          errorMessage: (error as Error).message,
        },
      });

      return {
        success: false,
        task: failedTask,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 回滚维护任务
   *
   * 将已应用的任务回滚到之前的状态
   *
   * 状态转换: APPLIED → REVERTED
   *
   * @param userId - 用户ID
   * @param taskId - 任务ID
   * @param comment - 回滚原因 (可选)
   * @returns 执行结果
   */
  async revertTask(
    userId: string,
    taskId: string,
    comment?: string
  ): Promise<TaskExecutionResult> {
    const task = await prisma.maintenanceTask.findFirst({
      where: { id: taskId, userId },
    });

    if (!task) {
      return { success: false, error: '任务不存在' };
    }

    if (task.status !== MaintenanceStatus.APPLIED) {
      return {
        success: false,
        error: `无法回滚状态为 "${task.status}" 的任务，只有 APPLIED 状态的任务可以回滚`,
      };
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 获取执行前的状态快照
        const changes = (task.changes as JsonObject) || {};
        const snapshot = changes._snapshot as JsonObject | undefined;

        if (!snapshot) {
          throw new Error('找不到任务执行前的状态快照，无法回滚');
        }

        // 根据任务类型执行回滚
        switch (task.taskType) {
          case MaintenanceType.ENTITY_MERGE:
            await this.revertEntityMerge(tx, task, snapshot);
            break;
          case MaintenanceType.RELATION_DISCOVERY:
            await this.revertRelationDiscovery(tx, task, snapshot);
            break;
          case MaintenanceType.TAG_OPTIMIZATION:
            await this.revertTagOptimization(tx, task, snapshot);
            break;
          case MaintenanceType.STALE_DETECTION:
            await this.revertStaleDetection(tx, task, snapshot);
            break;
          case MaintenanceType.ORPHAN_CLEANUP:
            // ORPHAN_CLEANUP 不需要回滚操作
            break;
          default:
            throw new Error(`未知的任务类型: ${task.taskType}`);
        }

        // 更新任务状态为已回滚
        const updatedTask = await tx.maintenanceTask.update({
          where: { id: taskId },
          data: {
            status: MaintenanceStatus.REVERTED,
            reviewComment: comment
              ? `回滚原因: ${comment}`
              : '任务已回滚',
          },
        });

        return updatedTask;
      });

      return { success: true, task: result };
    } catch (error) {
      return {
        success: false,
        error: `回滚失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 创建执行前的状态快照
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   * @returns 状态快照
   */
  private async createSnapshot(
    tx: Prisma.TransactionClient,
    task: MaintenanceTask
  ): Promise<JsonObject> {
    const snapshot: JsonObject = {};

    switch (task.taskType) {
      case MaintenanceType.ENTITY_MERGE:
        if (task.sourceEntityId && task.targetEntityId) {
          const sourceEntity = await tx.entity.findUnique({
            where: { id: task.sourceEntityId },
            include: {
              relationsFrom: true,
              relationsTo: true,
              capsuleEntities: true,
            },
          });
          const targetEntity = await tx.entity.findUnique({
            where: { id: task.targetEntityId },
            include: {
              relationsFrom: true,
              relationsTo: true,
              capsuleEntities: true,
            },
          });
          snapshot.sourceEntity = sourceEntity as unknown as JsonObject;
          snapshot.targetEntity = targetEntity as unknown as JsonObject;
        }
        break;

      case MaintenanceType.RELATION_DISCOVERY:
        // 关系发现不需要快照，因为只是创建新记录
        break;

      case MaintenanceType.TAG_OPTIMIZATION:
        // 标签优化快照在 changes 中已包含
        break;

      case MaintenanceType.STALE_DETECTION:
        if (task.sourceEntityId) {
          const entity = await tx.entity.findUnique({
            where: { id: task.sourceEntityId },
          });
          snapshot.entity = entity as unknown as JsonObject;
        }
        break;

      case MaintenanceType.ORPHAN_CLEANUP:
        // 孤立实体清理不需要快照
        break;
    }

    return snapshot;
  }

  /**
   * 执行实体合并
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   */
  private async executeEntityMerge(
    tx: Prisma.TransactionClient,
    task: MaintenanceTask
  ): Promise<void> {
    if (!task.sourceEntityId || !task.targetEntityId) {
      throw new Error('缺少实体ID');
    }

    const sourceEntity = await tx.entity.findUnique({
      where: { id: task.sourceEntityId },
    });

    const targetEntity = await tx.entity.findUnique({
      where: { id: task.targetEntityId },
    });

    if (!sourceEntity || !targetEntity) {
      throw new Error('实体不存在');
    }

    // 决定保留哪个实体（提及次数更多或更近的）
    const keepEntity =
      sourceEntity.mentionCount >= targetEntity.mentionCount
        ? sourceEntity
        : targetEntity;
    const mergeEntity =
      keepEntity.id === sourceEntity.id ? targetEntity : sourceEntity;

    // 更新关系指向保留的实体
    await tx.relation.updateMany({
      where: { fromEntityId: mergeEntity.id },
      data: { fromEntityId: keepEntity.id },
    });

    await tx.relation.updateMany({
      where: { toEntityId: mergeEntity.id },
      data: { toEntityId: keepEntity.id },
    });

    // 更新 CapsuleEntity 指向保留的实体
    await tx.capsuleEntity.updateMany({
      where: { entityId: mergeEntity.id },
      data: { entityId: keepEntity.id },
    });

    // 删除被合并的实体
    await tx.entity.delete({
      where: { id: mergeEntity.id },
    });

    // 更新保留实体的提及次数
    await tx.entity.update({
      where: { id: keepEntity.id },
      data: {
        mentionCount: keepEntity.mentionCount + mergeEntity.mentionCount,
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * 回滚实体合并
   *
   * 恢复被合并的实体，并还原关系指向
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   * @param snapshot - 状态快照
   */
  private async revertEntityMerge(
    tx: Prisma.TransactionClient,
    task: MaintenanceTask,
    snapshot: JsonObject
  ): Promise<void> {
    const sourceEntity = snapshot.sourceEntity as JsonObject | undefined;
    const targetEntity = snapshot.targetEntity as JsonObject | undefined;
    const mergedRelations = snapshot.mergedRelations as JsonObject[] | undefined;

    if (!sourceEntity || !targetEntity) {
      throw new Error('状态快照不完整，无法回滚');
    }

    // 确定哪个实体被删除了（mentionCount 较小的那个）
    const sourceMentionCount = (sourceEntity.mentionCount as number) || 0;
    const targetMentionCount = (targetEntity.mentionCount as number) || 0;
    
    const deletedEntity = sourceMentionCount >= targetMentionCount ? targetEntity : sourceEntity;
    const keptEntity = sourceMentionCount >= targetMentionCount ? sourceEntity : targetEntity;

    // 1. 重新创建被删除的实体
    await tx.entity.create({
      data: {
        id: deletedEntity.id as string,
        canonicalName: deletedEntity.canonicalName as string,
        normalizedName: deletedEntity.normalizedName as string,
        type: deletedEntity.type as string,
        description: deletedEntity.description as string | undefined,
        mentionCount: deletedEntity.mentionCount as number,
        firstSeenAt: new Date(deletedEntity.firstSeenAt as string),
        lastSeenAt: new Date(deletedEntity.lastSeenAt as string),
      },
    });

    // 2. 恢复关系指向
    if (mergedRelations && Array.isArray(mergedRelations)) {
      for (const relation of mergedRelations) {
        const fromEntityId = relation.fromEntityId as string;
        const toEntityId = relation.toEntityId as string;
        
        // 如果关系指向的是保留实体，需要检查是否应该指向被恢复的实体
        if (fromEntityId === keptEntity.id && relation.originalFromEntityId === deletedEntity.id) {
          await tx.relation.updateMany({
            where: {
              fromEntityId: keptEntity.id as string,
              toEntityId: relation.toEntityId as string,
            },
            data: { fromEntityId: deletedEntity.id as string },
          });
        }
        if (toEntityId === keptEntity.id && relation.originalToEntityId === deletedEntity.id) {
          await tx.relation.updateMany({
            where: {
              fromEntityId: relation.fromEntityId as string,
              toEntityId: keptEntity.id as string,
            },
            data: { toEntityId: deletedEntity.id as string },
          });
        }
      }
    }

    // 3. 恢复 CapsuleEntity 关联
    const capsuleEntities = snapshot.capsuleEntities as JsonObject[] | undefined;
    if (capsuleEntities && Array.isArray(capsuleEntities)) {
      for (const ce of capsuleEntities) {
        if (ce.originalEntityId === deletedEntity.id) {
          await tx.capsuleEntity.updateMany({
            where: {
              capsuleId: ce.capsuleId as string,
              entityId: keptEntity.id as string,
            },
            data: { entityId: deletedEntity.id as string },
          });
        }
      }
    }

    // 4. 恢复保留实体的提及次数
    await tx.entity.update({
      where: { id: keptEntity.id as string },
      data: {
        mentionCount: keptEntity.mentionCount as number,
      },
    });
  }

  /**
   * 执行关系发现
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   */
  private async executeRelationDiscovery(
    tx: Prisma.TransactionClient,
    task: MaintenanceTask
  ): Promise<void> {
    if (!task.sourceEntityId || !task.targetEntityId) {
      throw new Error('缺少实体ID');
    }

    // 检查关系是否已存在
    const existingRelation = await tx.relation.findFirst({
      where: {
        OR: [
          {
            fromEntityId: task.sourceEntityId,
            toEntityId: task.targetEntityId,
          },
          {
            fromEntityId: task.targetEntityId,
            toEntityId: task.sourceEntityId,
          },
        ],
      },
    });

    if (existingRelation) {
      throw new Error('关系已存在');
    }

    // 创建新关系
    await tx.relation.create({
      data: {
        fromEntityId: task.sourceEntityId,
        toEntityId: task.targetEntityId,
        relationType: 'RELATED_TO',
        createdBy: 'system',
        strength: task.confidence,
      },
    });
  }

  /**
   * 回滚关系发现
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   * @param snapshot - 状态快照
   */
  private async revertRelationDiscovery(
    tx: Prisma.TransactionClient,
    task: MaintenanceTask,
    _snapshot: JsonObject
  ): Promise<void> {
    if (!task.sourceEntityId || !task.targetEntityId) {
      throw new Error('缺少实体ID');
    }

    // 删除创建的关系
    await tx.relation.deleteMany({
      where: {
        fromEntityId: task.sourceEntityId,
        toEntityId: task.targetEntityId,
        relationType: 'RELATED_TO',
      },
    });
  }

  /**
   * 执行标签优化
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   */
  private async executeTagOptimization(
    tx: Prisma.TransactionClient,
    task: MaintenanceTask
  ): Promise<void> {
    const changes = (task.changes as JsonObject) || {};

    const tagAId = changes?.tagAId as string | undefined;
    const tagBId = changes?.tagBId as string | undefined;

    if (!tagAId || !tagBId) {
      throw new Error('缺少标签ID');
    }

    // 获取标签信息
    const tagA = await tx.tag.findUnique({ where: { id: tagAId } });
    const tagB = await tx.tag.findUnique({ where: { id: tagBId } });

    if (!tagA || !tagB) {
      throw new Error('标签不存在');
    }

    // 决定保留哪个标签（使用次数更多的）
    const tagAUsageCount = (changes?.tagAUsageCount as number) || 0;
    const tagBUsageCount = (changes?.tagBUsageCount as number) || 0;

    const keepTag = tagAUsageCount >= tagBUsageCount ? tagA : tagB;
    const mergeTag = keepTag.id === tagA.id ? tagB : tagA;

    // 更新 CapsuleTag 指向保留的标签
    await tx.capsuleTag.updateMany({
      where: { tagId: mergeTag.id },
      data: { tagId: keepTag.id },
    });

    // 删除被合并的标签
    await tx.tag.delete({
      where: { id: mergeTag.id },
    });
  }

  /**
   * 回滚标签优化
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   * @param _snapshot - 状态快照
   */
  private async revertTagOptimization(
    tx: Prisma.TransactionClient,
    task: MaintenanceTask,
    _snapshot: JsonObject
  ): Promise<void> {
    // 从 changes 中获取被删除的标签信息
    const changes = (task.changes as JsonObject) || {};
    const tagBName = changes?.tagBName as string | undefined;
    const tagBId = changes?.tagBId as string | undefined;

    if (!tagBName || !tagBId) {
      throw new Error('缺少标签信息，无法回滚');
    }

    // 重新创建被删除的标签
    await tx.tag.create({
      data: {
        id: tagBId,
        name: tagBName,
      },
    });

    // 注意：恢复 CapsuleTag 关联需要更复杂的逻辑
    // 这里简化处理
  }

  /**
   * 执行过时实体检测
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   */
  private async executeStaleDetection(
    tx: Prisma.TransactionClient,
    task: MaintenanceTask
  ): Promise<void> {
    if (!task.sourceEntityId) {
      throw new Error('缺少实体ID');
    }

    // 将实体标记为过时（通过更新描述或添加元数据）
    // 注意: Entity 模型没有 status 字段，这里只是记录操作
    // 实际实现可能需要添加 status 字段或使用其他方式标记
    const entity = await tx.entity.findUnique({
      where: { id: task.sourceEntityId },
    });

    if (!entity) {
      throw new Error('实体不存在');
    }

    // 更新描述以标记为过时
    const staleNote = `[STALE] 该实体已过时，最后提及时间: ${entity.lastSeenAt.toISOString()}`;
    await tx.entity.update({
      where: { id: task.sourceEntityId },
      data: {
        description: entity.description
          ? `${entity.description}\n${staleNote}`
          : staleNote,
      },
    });
  }

  /**
   * 回滚过时实体检测
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   * @param _snapshot - 状态快照
   */
  private async revertStaleDetection(
    tx: Prisma.TransactionClient,
    task: MaintenanceTask,
    snapshot: JsonObject
  ): Promise<void> {
    if (!task.sourceEntityId) {
      throw new Error('缺少实体ID');
    }

    // 恢复实体描述
    const entitySnapshot = snapshot.entity as JsonObject | undefined;
    if (entitySnapshot && entitySnapshot.description !== undefined) {
      await tx.entity.update({
        where: { id: task.sourceEntityId },
        data: {
          description: entitySnapshot.description as string | null,
        },
      });
    }
  }

  /**
   * 执行孤立实体清理
   *
   * @param tx - Prisma 事务客户端
   * @param task - 维护任务
   */
  private async executeOrphanCleanup(
    _tx: Prisma.TransactionClient,
    _task: MaintenanceTask
  ): Promise<void> {
    // ORPHAN_CLEANUP 只是标记，不执行实际删除
    // 实际删除由用户手动决定
  }

  /**
   * 获取知识图谱健康报告
   *
   * @param userId - 用户ID
   * @returns 健康报告
   */
  async getHealthReport(userId: string): Promise<HealthReport> {
    const [
      totalEntities,
      totalRelations,
      orphanEntities,
      staleEntities,
      potentialDuplicates,
    ] = await Promise.all([
      prisma.entity.count(),
      prisma.relation.count(),
      prisma.entity.count({
        where: {
          AND: [
            { relationsFrom: { none: {} } },
            { relationsTo: { none: {} } },
          ],
        },
      }),
      prisma.entity.count({
        where: {
          lastSeenAt: {
            lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.maintenanceTask.count({
        where: {
          userId,
          taskType: MaintenanceType.ENTITY_MERGE,
          status: {
            in: [
              MaintenanceStatus.PENDING,
              MaintenanceStatus.AWAITING_USER_REVIEW,
              MaintenanceStatus.AUTO_APPROVED,
            ],
          },
        },
      }),
    ]);

    // 计算健康评分
    let score = 100;
    score -= orphanEntities * 2;
    score -= potentialDuplicates * 5;
    score -= staleEntities * 3;
    score = Math.max(0, score);

    // 获取详细信息
    const orphanEntityIds = await prisma.entity.findMany({
      where: {
        AND: [
          { relationsFrom: { none: {} } },
          { relationsTo: { none: {} } },
        ],
      },
      select: { id: true },
      take: 10,
    });

    const duplicateTasks = await prisma.maintenanceTask.findMany({
      where: {
        userId,
        taskType: MaintenanceType.ENTITY_MERGE,
        status: {
          in: [
            MaintenanceStatus.PENDING,
            MaintenanceStatus.AWAITING_USER_REVIEW,
            MaintenanceStatus.AUTO_APPROVED,
          ],
        },
      },
      select: {
        sourceEntityId: true,
        targetEntityId: true,
        confidence: true,
      },
      take: 10,
    });

    const staleEntityIds = await prisma.entity.findMany({
      where: {
        lastSeenAt: {
          lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true },
      take: 10,
    });

    return {
      score,
      totalEntities,
      totalRelations,
      orphanEntities,
      potentialDuplicates,
      staleEntities,
      brokenRelations: 0,
      details: {
        orphanEntities: orphanEntityIds.map((e) => e.id),
        potentialDuplicates: duplicateTasks.map((t) => ({
          entityAId: t.sourceEntityId!,
          entityBId: t.targetEntityId!,
          similarity: t.confidence,
        })),
        staleEntities: staleEntityIds.map((e) => e.id),
        brokenRelations: [],
      },
    };
  }

  /**
   * 运行完整维护扫描
   *
   * 执行所有类型的维护扫描
   *
   * @param userId - 用户ID
   * @returns 扫描结果统计
   */
  async runFullScan(userId: string): Promise<{
    duplicates: number;
    relations: number;
    stale: number;
    orphans: number;
    tags: number;
  }> {
    const [duplicates, relations, stale, orphans, tags] = await Promise.all([
      this.scanForDuplicates(userId),
      this.discoverRelations(userId),
      this.detectStaleEntities(userId),
      this.detectOrphanEntities(userId),
      this.optimizeTags(userId),
    ]);

    return {
      duplicates: duplicates.length,
      relations: relations.length,
      stale: stale.length,
      orphans: orphans.length,
      tags: tags.length,
    };
  }

  /**
   * 自动执行高置信度任务
   *
   * 自动执行所有 AUTO_APPROVED 状态的任务
   *
   * @param userId - 用户ID
   * @returns 执行结果列表
   */
  async autoApplyTasks(userId: string): Promise<TaskExecutionResult[]> {
    const { tasks } = await this.getTasks(userId, {
      status: MaintenanceStatus.AUTO_APPROVED,
      limit: 100,
    });

    const results: TaskExecutionResult[] = [];

    for (const task of tasks) {
      const result = await this.applyTask(userId, task.id);
      results.push(result);
    }

    return results;
  }
}

/**
 * 默认维护服务实例
 */
export const maintenanceService = new MaintenanceService();
