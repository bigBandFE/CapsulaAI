import { PrismaClient, Prisma, Entity, Relation, CapsuleEntity, MaintenanceTask, MaintenanceType, MaintenanceStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * JSON 对象类型
 */
type JsonObject = Record<string, unknown>;

/**
 * 带关系的实体类型
 */
type EntityWithRelations = Entity & {
  relationsFrom: Relation[];
  relationsTo: Relation[];
  capsuleEntities: CapsuleEntity[];
};

/**
 * 合并预览结果接口
 */
export interface MergePreview {
  /** 保留实体 */
  keepEntity: EntityWithRelations;
  /** 被合并实体 */
  mergeEntity: EntityWithRelations;
  /** 关系迁移预览 */
  relationMigration: {
    /** 将被迁移的关系 */
    relationsToMigrate: Array<{
      id: string;
      type: string;
      fromEntityId: string;
      toEntityId: string;
      direction: 'incoming' | 'outgoing';
    }>;
    /** 将被跳过的重复关系 */
    duplicateRelations: Array<{
      id: string;
      type: string;
      reason: string;
    }>;
  };
  /** 别名合并预览 */
  aliasMerge: {
    /** 当前保留实体别名 */
    keepEntityAliases: string[];
    /** 当前被合并实体别名 */
    mergeEntityAliases: string[];
    /** 合并后的别名列表 */
    mergedAliases: string[];
    /** 新增别名 */
    newAliases: string[];
  };
  /** 标签合并预览 */
  tagMerge: {
    /** 保留实体标签 */
    keepEntityTags: string[];
    /** 被合并实体标签 */
    mergeEntityTags: string[];
    /** 合并后的标签列表 */
    mergedTags: string[];
    /** 新增标签 */
    newTags: string[];
  };
  /** 引用更新预览 */
  referenceUpdates: {
    /** 将被更新的胶囊实体关联 */
    capsuleEntityUpdates: number;
    /** 将被更新的嵌入记录 */
    embeddingUpdates: number;
  };
  /** 合并后统计 */
  postMergeStats: {
    /** 合并后提及次数 */
    mergedMentionCount: number;
    /** 合并后关系数 */
    mergedRelationCount: number;
  };
}

/**
 * 合并操作结果接口
 */
export interface MergeResult {
  /** 是否成功 */
  success: boolean;
  /** 保留的实体ID */
  keptEntityId?: string;
  /** 被删除的实体ID */
  deletedEntityId?: string;
  /** 迁移的关系数量 */
  migratedRelationsCount?: number;
  /** 跳过的重复关系数量 */
  skippedRelationsCount?: number;
  /** 更新的胶囊实体关联数量 */
  updatedCapsuleEntitiesCount?: number;
  /** 合并的别名数量 */
  mergedAliasesCount?: number;
  /** 合并的标签数量 */
  mergedTagsCount?: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 合并日志条目接口
 */
export interface MergeLogEntry {
  /** 日志ID */
  id: string;
  /** 任务ID */
  taskId?: string;
  /** 用户ID */
  userId?: string;
  /** 操作类型 */
  operation: 'PREVIEW' | 'MERGE' | 'ROLLBACK';
  /** 保留实体ID */
  keepEntityId: string;
  /** 被合并实体ID */
  mergeEntityId: string;
  /** 状态快照 */
  snapshot?: JsonObject;
  /** 操作详情 */
  details: JsonObject;
  /** 操作是否成功 */
  success?: boolean;
  /** 错误信息 */
  errorMessage?: string;
  /** 操作时间 */
  createdAt: Date;
}

/**
 * 关系迁移配置接口
 */
export interface RelationMigrationConfig {
  /** 是否跳过已存在的关系 */
  skipExistingRelations: boolean;
  /** 关系强度阈值 */
  minStrengthThreshold: number;
}

/**
 * 实体合并服务
 *
 * 提供知识图谱实体合并的完整工作流:
 * - 合并预览: 在正式合并前展示合并效果
 * - 关系迁移: 将被合并实体的关系迁移到保留实体
 * - 别名合并: 合并两个实体的别名列表
 * - 标签合并: 合并两个实体的标签
 * - 引用更新: 更新所有引用被合并实体的记录
 * - 合并日志: 记录合并操作的详细信息
 *
 * @example
 * ```typescript
 * // 预览合并
 * const preview = await mergeService.previewMerge('entity-a-id', 'entity-b-id');
 * console.log(preview.aliasMerge.mergedAliases);
 *
 * // 执行合并
 * const result = await mergeService.executeMerge('task-id', 'entity-a-id', 'entity-b-id');
 * if (result.success) {
 *   console.log(`合并完成，保留实体: ${result.keptEntityId}`);
 * }
 *
 * // 回滚合并
 * await mergeService.rollbackMerge('task-id');
 * ```
 */
export class MergeService {
  /**
   * 默认关系迁移配置
   */
  private readonly defaultMigrationConfig: RelationMigrationConfig = {
    skipExistingRelations: true,
    minStrengthThreshold: 0.0,
  };

  /**
   * 生成合并预览
   *
   * 在正式合并前展示合并效果，包括关系迁移、别名合并、标签合并等
   *
   * @param sourceEntityId - 源实体ID
   * @param targetEntityId - 目标实体ID
   * @param config - 关系迁移配置 (可选)
   * @returns 合并预览结果
   * @throws Error 当实体不存在时
   */
  async previewMerge(
    sourceEntityId: string,
    targetEntityId: string,
    config: Partial<RelationMigrationConfig> = {}
  ): Promise<MergePreview> {
    const migrationConfig = { ...this.defaultMigrationConfig, ...config };

    // 获取两个实体及其关联数据
    const [sourceEntity, targetEntity] = await Promise.all([
      this.getEntityWithRelations(sourceEntityId),
      this.getEntityWithRelations(targetEntityId),
    ]);

    if (!sourceEntity) {
      throw new Error(`源实体不存在: ${sourceEntityId}`);
    }
    if (!targetEntity) {
      throw new Error(`目标实体不存在: ${targetEntityId}`);
    }

    // 决定保留哪个实体（提及次数更多或更近的）
    const { keepEntity, mergeEntity } = this.determineKeepEntity(
      sourceEntity,
      targetEntity
    );

    // 分析关系迁移
    const relationMigration = await this.analyzeRelationMigration(
      keepEntity,
      mergeEntity,
      migrationConfig
    );

    // 分析别名合并
    const aliasMerge = this.analyzeAliasMerge(keepEntity, mergeEntity);

    // 分析标签合并
    const tagMerge = await this.analyzeTagMerge(keepEntity, mergeEntity);

    // 分析引用更新
    const referenceUpdates = await this.analyzeReferenceUpdates(mergeEntity);

    // 计算合并后统计
    const postMergeStats = {
      mergedMentionCount: keepEntity.mentionCount + mergeEntity.mentionCount,
      mergedRelationCount:
        keepEntity.relationsFrom.length +
        keepEntity.relationsTo.length +
        relationMigration.relationsToMigrate.length,
    };

    return {
      keepEntity,
      mergeEntity,
      relationMigration,
      aliasMerge,
      tagMerge,
      referenceUpdates,
      postMergeStats,
    };
  }

  /**
   * 执行实体合并
   *
   * 使用事务保证数据一致性，支持回滚操作
   *
   * @param taskId - 维护任务ID
   * @param sourceEntityId - 源实体ID
   * @param targetEntityId - 目标实体ID
   * @param config - 关系迁移配置 (可选)
   * @returns 合并结果
   */
  async executeMerge(
    taskId: string,
    sourceEntityId: string,
    targetEntityId: string,
    config: Partial<RelationMigrationConfig> = {}
  ): Promise<MergeResult> {
    const migrationConfig = { ...this.defaultMigrationConfig, ...config };

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. 获取实体信息
        const sourceEntity = await this.getEntityWithRelations(sourceEntityId);
        const targetEntity = await this.getEntityWithRelations(targetEntityId);

        if (!sourceEntity || !targetEntity) {
          throw new Error('实体不存在');
        }

        // 检查是否尝试合并同一个实体
        if (sourceEntity.id === targetEntity.id) {
          throw new Error('不能合并实体到自身');
        }

        // 检查环形合并
        const hasCycle = await this.checkMergeCycle(tx, sourceEntityId, targetEntityId);
        if (hasCycle) {
          throw new Error('检测到环形合并：目标实体已经是源实体的合并目标');
        }

        // 检查实体是否已被合并
        if (sourceEntity.status === 'MERGED' || targetEntity.status === 'MERGED') {
          throw new Error('不能合并已被标记为 MERGED 的实体');
        }

        // 决定保留哪个实体
        const { keepEntity, mergeEntity } = this.determineKeepEntity(
          sourceEntity,
          targetEntity
        );

        // 2. 创建状态快照用于回滚
        const snapshot = await this.createMergeSnapshot(tx, keepEntity, mergeEntity);

        // 3. 迁移关系
        const migrationResult = await this.migrateRelations(
          tx,
          keepEntity,
          mergeEntity,
          migrationConfig
        );

        // 4. 合并别名
        const mergedAliases = await this.mergeAliases(tx, keepEntity, mergeEntity);

        // 5. 合并标签
        const mergedTags = await this.mergeTags(tx, keepEntity, mergeEntity);

        // 6. 更新引用
        const referenceUpdateResult = await this.updateReferences(
          tx,
          keepEntity,
          mergeEntity
        );

        // 7. 更新保留实体的统计信息
        await tx.entity.update({
          where: { id: keepEntity.id },
          data: {
            mentionCount: keepEntity.mentionCount + mergeEntity.mentionCount,
            lastSeenAt: new Date(),
            description: this.mergeDescriptions(
              keepEntity.description,
              mergeEntity.description
            ),
          },
        });

        // 8. 标记被合并的实体为 MERGED 状态（而不是删除）
        await tx.entity.update({
          where: { id: mergeEntity.id },
          data: {
            status: 'MERGED',
            mergedIntoId: keepEntity.id,
            // 保留 mentionCount 和其他数据用于可能的回滚
          },
        });

        // 9. 更新维护任务状态
        await tx.maintenanceTask.update({
          where: { id: taskId },
          data: {
            status: MaintenanceStatus.APPLIED,
            appliedAt: new Date(),
            changes: {
              _mergeSnapshot: snapshot,
              _mergeResult: {
                keepEntityId: keepEntity.id,
                mergeEntityId: mergeEntity.id,
                migratedRelationsCount: migrationResult.migratedCount,
                skippedRelationsCount: migrationResult.skippedCount,
                mergedAliasesCount: mergedAliases.length,
                mergedTagsCount: mergedTags.length,
                updatedCapsuleEntitiesCount: referenceUpdateResult.capsuleEntityCount,
              },
            } as unknown as Prisma.InputJsonValue,
          },
        });

        // 10. 记录合并日志
        await this.logMergeOperation(tx, {
          taskId,
          operation: 'MERGE',
          keepEntityId: keepEntity.id,
          mergeEntityId: mergeEntity.id,
          details: {
            migratedRelations: migrationResult.migratedRelations,
            skippedRelations: migrationResult.skippedRelations,
            mergedAliases,
            mergedTags,
            referenceUpdates: referenceUpdateResult,
          },
        });

        return {
          success: true,
          keptEntityId: keepEntity.id,
          deletedEntityId: mergeEntity.id,
          migratedRelationsCount: migrationResult.migratedCount,
          skippedRelationsCount: migrationResult.skippedCount,
          updatedCapsuleEntitiesCount: referenceUpdateResult.capsuleEntityCount,
          mergedAliasesCount: mergedAliases.length,
          mergedTagsCount: mergedTags.length,
        };
      });

      return result;
    } catch (error) {
      // 记录错误日志
      await this.logMergeOperation(prisma, {
        taskId,
        operation: 'MERGE',
        keepEntityId: sourceEntityId,
        mergeEntityId: targetEntityId,
        details: {
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
      });

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 回滚实体合并
   *
   * 根据维护任务中的状态快照恢复被合并的实体
   *
   * @param taskId - 维护任务ID
   * @returns 是否成功回滚
   * @throws Error 当任务不存在或没有快照时
   */
  async rollbackMerge(taskId: string): Promise<boolean> {
    const task = await prisma.maintenanceTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    if (task.status !== MaintenanceStatus.APPLIED) {
      throw new Error(`任务状态不是 APPLIED，无法回滚: ${task.status}`);
    }

    const changes = (task.changes as JsonObject) || {};
    const snapshot = changes._mergeSnapshot as JsonObject | undefined;

    if (!snapshot) {
      throw new Error('找不到合并快照，无法回滚');
    }

    try {
      await prisma.$transaction(async (tx) => {
        // 1. 恢复被合并实体的状态（从 MERGED 恢复为 ACTIVE）
        const mergeEntitySnapshot = snapshot.mergeEntity as JsonObject;
        await tx.entity.update({
          where: { id: mergeEntitySnapshot.id as string },
          data: {
            status: 'ACTIVE',
            mergedIntoId: null,
            // 恢复原始字段值
            canonicalName: mergeEntitySnapshot.canonicalName as string,
            normalizedName: mergeEntitySnapshot.normalizedName as string,
            type: mergeEntitySnapshot.type as string,
            description: mergeEntitySnapshot.description as string | undefined,
            aliases: (mergeEntitySnapshot.aliases as string[]) || [],
            mentionCount: mergeEntitySnapshot.mentionCount as number,
            firstSeenAt: new Date(mergeEntitySnapshot.firstSeenAt as string),
            lastSeenAt: new Date(mergeEntitySnapshot.lastSeenAt as string),
            confidenceScore: (mergeEntitySnapshot.confidenceScore as number) ?? 1.0,
          },
        });

        // 2. 恢复关系
        const relationsSnapshot = snapshot.relations as JsonObject[];
        if (relationsSnapshot && Array.isArray(relationsSnapshot)) {
          for (const relation of relationsSnapshot) {
            // 检查关系是否已存在
            const existing = await tx.relation.findFirst({
              where: {
                fromEntityId: relation.fromEntityId as string,
                toEntityId: relation.toEntityId as string,
                relationType: relation.relationType as string,
              },
            });

            if (!existing) {
              await tx.relation.create({
                data: {
                  id: relation.id as string,
                  fromEntityId: relation.fromEntityId as string,
                  toEntityId: relation.toEntityId as string,
                  relationType: relation.relationType as string,
                  strength: (relation.strength as number) ?? 1.0,
                  createdBy: (relation.createdBy as string) ?? 'system',
                  firstSeenAt: new Date(relation.firstSeenAt as string),
                  lastSeenAt: new Date(relation.lastSeenAt as string),
                  mentionCount: (relation.mentionCount as number) ?? 1,
                },
              });
            }
          }
        }

        // 3. 恢复 CapsuleEntity 关联
        const capsuleEntitiesSnapshot = snapshot.capsuleEntities as JsonObject[];
        if (capsuleEntitiesSnapshot && Array.isArray(capsuleEntitiesSnapshot)) {
          for (const ce of capsuleEntitiesSnapshot) {
            // 检查是否已存在
            const existing = await tx.capsuleEntity.findFirst({
              where: {
                capsuleId: ce.capsuleId as string,
                entityId: ce.entityId as string,
              },
            });

            if (!existing) {
              await tx.capsuleEntity.create({
                data: {
                  id: ce.id as string,
                  capsuleId: ce.capsuleId as string,
                  entityId: ce.entityId as string,
                  role: ce.role as string | undefined,
                  confidenceScore: (ce.confidenceScore as number) ?? 1.0,
                  createdAt: new Date(ce.createdAt as string),
                },
              });
            }
          }
        }

        // 4. 恢复保留实体的原始状态
        const keepEntitySnapshot = snapshot.keepEntity as JsonObject;
        await tx.entity.update({
          where: { id: keepEntitySnapshot.id as string },
          data: {
            mentionCount: keepEntitySnapshot.mentionCount as number,
            description: keepEntitySnapshot.description as string | undefined,
            aliases: (keepEntitySnapshot.aliases as string[]) || [],
            lastSeenAt: new Date(keepEntitySnapshot.lastSeenAt as string),
          },
        });

        // 5. 更新任务状态为已回滚
        await tx.maintenanceTask.update({
          where: { id: taskId },
          data: {
            status: MaintenanceStatus.REVERTED,
            reviewComment: '任务已回滚',
          },
        });

        // 6. 记录回滚日志
        await this.logMergeOperation(tx, {
          taskId,
          operation: 'ROLLBACK',
          keepEntityId: keepEntitySnapshot.id as string,
          mergeEntityId: mergeEntitySnapshot.id as string,
          details: {
            restoredRelationsCount: relationsSnapshot?.length ?? 0,
            restoredCapsuleEntitiesCount: capsuleEntitiesSnapshot?.length ?? 0,
          },
        });
      });

      return true;
    } catch (error) {
      console.error('回滚合并失败:', error);
      throw error;
    }
  }

  /**
   * 获取合并日志
   *
   * @param options - 查询选项
   * @returns 合并日志列表
   */
  async getMergeLogs(options: {
    taskId?: string;
    entityId?: string;
    operation?: 'PREVIEW' | 'MERGE' | 'ROLLBACK';
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: MergeLogEntry[]; total: number }> {
    const { taskId, entityId, operation, limit = 50, offset = 0 } = options;

    // 从 MergeLog 表查询日志
    const where: Prisma.MergeLogWhereInput = {};

    if (taskId) {
      where.taskId = taskId;
    }

    if (entityId) {
      where.OR = [
        { keepEntityId: entityId },
        { mergeEntityId: entityId },
      ];
    }

    if (operation) {
      where.operation = operation;
    }

    const [logs, total] = await Promise.all([
      prisma.mergeLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.mergeLog.count({ where }),
    ]);

    const formattedLogs: MergeLogEntry[] = logs.map((log) => ({
      id: log.id,
      taskId: log.taskId || undefined,
      operation: log.operation,
      keepEntityId: log.keepEntityId,
      mergeEntityId: log.mergeEntityId,
      snapshot: log.snapshot as JsonObject,
      details: log.details as JsonObject,
      success: log.success,
      errorMessage: log.errorMessage || undefined,
      createdAt: log.createdAt,
    }));

    return { logs: formattedLogs, total };
  }

  /**
   * 批量执行合并
   *
   * @param taskIds - 维护任务ID列表
   * @returns 每个任务的执行结果
   */
  async batchMerge(taskIds: string[]): Promise<MergeResult[]> {
    const results: MergeResult[] = [];

    for (const taskId of taskIds) {
      const task = await prisma.maintenanceTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        results.push({
          success: false,
          error: `任务不存在: ${taskId}`,
        });
        continue;
      }

      if (
        task.status !== MaintenanceStatus.APPROVED &&
        task.status !== MaintenanceStatus.AUTO_APPROVED
      ) {
        results.push({
          success: false,
          error: `任务状态不正确: ${task.status}`,
        });
        continue;
      }

      if (!task.sourceEntityId || !task.targetEntityId) {
        results.push({
          success: false,
          error: '任务缺少实体ID',
        });
        continue;
      }

      const result = await this.executeMerge(
        taskId,
        task.sourceEntityId,
        task.targetEntityId
      );
      results.push(result);
    }

    return results;
  }

  // ==================== 私有方法 ====================

  /**
   * 获取实体及其关系
   *
   * @param entityId - 实体ID
   * @returns 实体及其关系
   */
  private async getEntityWithRelations(
    entityId: string
  ): Promise<EntityWithRelations> {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      include: {
        relationsFrom: true,
        relationsTo: true,
        capsuleEntities: true,
      },
    });

    if (!entity) {
      throw new Error(`实体不存在: ${entityId}`);
    }

    return entity as EntityWithRelations;
  }

  /**
   * 决定保留哪个实体
   *
   * 策略: 提及次数更多、更近被提及、或ID更小的实体
   *
   * @param entityA - 实体A
   * @param entityB - 实体B
   * @returns 保留实体和被合并实体
   */
  private determineKeepEntity(
    entityA: EntityWithRelations,
    entityB: EntityWithRelations
  ): { keepEntity: EntityWithRelations; mergeEntity: EntityWithRelations } {
    // 优先保留提及次数更多的实体
    if (entityA.mentionCount !== entityB.mentionCount) {
      return entityA.mentionCount > entityB.mentionCount
        ? { keepEntity: entityA, mergeEntity: entityB }
        : { keepEntity: entityB, mergeEntity: entityA };
    }

    // 其次保留更近被提及的实体
    if (entityA.lastSeenAt.getTime() !== entityB.lastSeenAt.getTime()) {
      return entityA.lastSeenAt > entityB.lastSeenAt
        ? { keepEntity: entityA, mergeEntity: entityB }
        : { keepEntity: entityB, mergeEntity: entityA };
    }

    // 最后保留ID更小的实体（确定性选择）
    return entityA.id < entityB.id
      ? { keepEntity: entityA, mergeEntity: entityB }
      : { keepEntity: entityB, mergeEntity: entityA };
  }

  /**
   * 分析关系迁移
   *
   * @param keepEntity - 保留实体
   * @param mergeEntity - 被合并实体
   * @param config - 迁移配置
   * @returns 关系迁移分析结果
   */
  private async analyzeRelationMigration(
    keepEntity: EntityWithRelations,
    mergeEntity: EntityWithRelations,
    config: RelationMigrationConfig
  ): Promise<MergePreview['relationMigration']> {
    const relationsToMigrate: MergePreview['relationMigration']['relationsToMigrate'] = [];
    const duplicateRelations: MergePreview['relationMigration']['duplicateRelations'] = [];

    // 收集被合并实体的所有关系
    const mergeRelations = [
      ...mergeEntity.relationsFrom.map((r) => ({ ...r, direction: 'outgoing' as const })),
      ...mergeEntity.relationsTo.map((r) => ({ ...r, direction: 'incoming' as const })),
    ];

    // 收集保留实体的所有关系用于去重检查
    const keepRelationKeys = new Set(
      [
        ...keepEntity.relationsFrom.map(
          (r) => `${r.fromEntityId}-${r.toEntityId}-${r.relationType}`
        ),
        ...keepEntity.relationsTo.map(
          (r) => `${r.fromEntityId}-${r.toEntityId}-${r.relationType}`
        ),
      ].map((key) => key.replace(keepEntity.id, mergeEntity.id))
    );

    for (const relation of mergeRelations) {
      // 检查关系强度
      if (relation.strength < config.minStrengthThreshold) {
        duplicateRelations.push({
          id: relation.id,
          type: relation.relationType,
          reason: '关系强度低于阈值',
        });
        continue;
      }

      // 检查是否是自引用关系
      const otherEntityId =
        relation.direction === 'outgoing' ? relation.toEntityId : relation.fromEntityId;
      if (otherEntityId === keepEntity.id) {
        duplicateRelations.push({
          id: relation.id,
          type: relation.relationType,
          reason: '与保留实体形成自引用关系',
        });
        continue;
      }

      // 检查是否会导致重复关系
      if (config.skipExistingRelations) {
        const newKey =
          relation.direction === 'outgoing'
            ? `${keepEntity.id}-${relation.toEntityId}-${relation.relationType}`
            : `${relation.fromEntityId}-${keepEntity.id}-${relation.relationType}`;

        const existingKey = newKey.replace(keepEntity.id, mergeEntity.id);
        if (keepRelationKeys.has(existingKey)) {
          duplicateRelations.push({
            id: relation.id,
            type: relation.relationType,
            reason: '与保留实体的现有关系重复',
          });
          continue;
        }
      }

      relationsToMigrate.push({
        id: relation.id,
        type: relation.relationType,
        fromEntityId: relation.fromEntityId,
        toEntityId: relation.toEntityId,
        direction: relation.direction,
      });
    }

    return { relationsToMigrate, duplicateRelations };
  }

  /**
   * 分析别名合并
   *
   * @param keepEntity - 保留实体
   * @param mergeEntity - 被合并实体
   * @returns 别名合并分析结果
   */
  private analyzeAliasMerge(
    keepEntity: Entity,
    mergeEntity: Entity
  ): MergePreview['aliasMerge'] {
    // 从 canonicalName 和 description 中提取可能的别名
    const keepEntityAliases = this.extractAliases(keepEntity);
    const mergeEntityAliases = this.extractAliases(mergeEntity);

    // 合并别名（去重，保留大小写）
    const mergedAliases: string[] = [];
    const seen = new Set<string>();
    for (const alias of [...keepEntityAliases, ...mergeEntityAliases]) {
      const lowerAlias = alias.toLowerCase();
      if (!seen.has(lowerAlias)) {
        seen.add(lowerAlias);
        mergedAliases.push(alias);
      }
    }

    // 找出新增别名
    const newAliases = mergeEntityAliases.filter(
      (alias) => !keepEntityAliases.some((a) => a.toLowerCase() === alias.toLowerCase())
    );

    return {
      keepEntityAliases,
      mergeEntityAliases,
      mergedAliases,
      newAliases,
    };
  }

  /**
   * 分析标签合并
   *
   * @param keepEntity - 保留实体
   * @param mergeEntity - 被合并实体
   * @returns 标签合并分析结果
   */
  private async analyzeTagMerge(
    keepEntity: Entity,
    mergeEntity: Entity
  ): Promise<MergePreview['tagMerge']> {
    // 获取实体的标签
    const [keepEntityTags, mergeEntityTags] = await Promise.all([
      this.getEntityTags(keepEntity.id),
      this.getEntityTags(mergeEntity.id),
    ]);

    // 合并标签（去重）
    const mergedTags: string[] = [];
    const seen = new Set<string>();
    for (const tag of [...keepEntityTags, ...mergeEntityTags]) {
      const lowerTag = tag.toLowerCase();
      if (!seen.has(lowerTag)) {
        seen.add(lowerTag);
        mergedTags.push(tag);
      }
    }

    // 找出新增标签
    const newTags = mergeEntityTags.filter((tag) => !keepEntityTags.includes(tag));

    return {
      keepEntityTags,
      mergeEntityTags,
      mergedTags,
      newTags,
    };
  }

  /**
   * 获取实体关联的标签
   *
   * @param entityId - 实体ID
   * @returns 标签名称列表
   */
  private async getEntityTags(entityId: string): Promise<string[]> {
    const capsuleEntities = await prisma.capsuleEntity.findMany({
      where: { entityId },
      select: { capsuleId: true },
    });

    const capsuleIds = capsuleEntities.map((ce) => ce.capsuleId);

    if (capsuleIds.length === 0) {
      return [];
    }

    const capsuleTags = await prisma.capsuleTag.findMany({
      where: { capsuleId: { in: capsuleIds } },
      include: { tag: true },
    });

    const tagNames: string[] = [];
    const seen = new Set<string>();
    for (const ct of capsuleTags) {
      if (!seen.has(ct.tag.name)) {
        seen.add(ct.tag.name);
        tagNames.push(ct.tag.name);
      }
    }
    return tagNames;
  }

  /**
   * 检查是否存在环形合并
   *
   * 防止 A -> B -> A 这样的循环合并
   *
   * @param tx - Prisma 事务客户端
   * @param sourceId - 源实体ID
   * @param targetId - 目标实体ID
   * @returns 是否存在环形合并
   */
  private async checkMergeCycle(
    tx: Prisma.TransactionClient,
    sourceId: string,
    targetId: string
  ): Promise<boolean> {
    // 检查 targetId 是否已经是 sourceId 的合并目标
    // 即检查 targetId 是否已经被合并到了 sourceId 的链中
    let currentId: string | null = targetId;
    const visited = new Set<string>();

    while (currentId) {
      // 防止无限循环
      if (visited.has(currentId)) {
        return true; // 发现循环
      }
      visited.add(currentId);

      // 如果当前实体就是源实体，说明会形成环形
      if (currentId === sourceId) {
        return true;
      }

      const entity = await tx.entity.findUnique({
        where: { id: currentId },
        select: { mergedIntoId: true },
      });

      currentId = entity?.mergedIntoId ?? null;
    }

    return false;
  }

  /**
   * 分析引用更新
   *
   * @param mergeEntity - 被合并实体
   * @returns 引用更新分析结果
   */
  private async analyzeReferenceUpdates(
    mergeEntity: EntityWithRelations
  ): Promise<MergePreview['referenceUpdates']> {
    const capsuleEntityCount = mergeEntity.capsuleEntities.length;

    // 检查嵌入记录
    const embeddingCount = await prisma.embedding.count({
      where: { objectId: mergeEntity.id, objectType: 'ENTITY' },
    });

    return {
      capsuleEntityUpdates: capsuleEntityCount,
      embeddingUpdates: embeddingCount,
    };
  }

  /**
   * 创建合并状态快照
   *
   * @param tx - Prisma 事务客户端
   * @param keepEntity - 保留实体
   * @param mergeEntity - 被合并实体
   * @returns 状态快照
   */
  private async createMergeSnapshot(
    tx: Prisma.TransactionClient,
    keepEntity: Entity,
    mergeEntity: EntityWithRelations
  ): Promise<JsonObject> {
    return {
      keepEntity: {
        id: keepEntity.id,
        canonicalName: keepEntity.canonicalName,
        normalizedName: keepEntity.normalizedName,
        type: keepEntity.type,
        description: keepEntity.description,
        aliases: keepEntity.aliases,
        status: keepEntity.status,
        mentionCount: keepEntity.mentionCount,
        firstSeenAt: keepEntity.firstSeenAt,
        lastSeenAt: keepEntity.lastSeenAt,
        confidenceScore: keepEntity.confidenceScore,
      },
      mergeEntity: {
        id: mergeEntity.id,
        canonicalName: mergeEntity.canonicalName,
        normalizedName: mergeEntity.normalizedName,
        type: mergeEntity.type,
        description: mergeEntity.description,
        aliases: mergeEntity.aliases,
        status: mergeEntity.status,
        mentionCount: mergeEntity.mentionCount,
        firstSeenAt: mergeEntity.firstSeenAt,
        lastSeenAt: mergeEntity.lastSeenAt,
        confidenceScore: mergeEntity.confidenceScore,
      },
      relations: [
        ...mergeEntity.relationsFrom.map((r) => ({
          id: r.id,
          fromEntityId: r.fromEntityId,
          toEntityId: r.toEntityId,
          relationType: r.relationType,
          strength: r.strength,
          createdBy: r.createdBy,
          firstSeenAt: r.firstSeenAt,
          lastSeenAt: r.lastSeenAt,
          mentionCount: r.mentionCount,
        })),
        ...mergeEntity.relationsTo.map((r) => ({
          id: r.id,
          fromEntityId: r.fromEntityId,
          toEntityId: r.toEntityId,
          relationType: r.relationType,
          strength: r.strength,
          createdBy: r.createdBy,
          firstSeenAt: r.firstSeenAt,
          lastSeenAt: r.lastSeenAt,
          mentionCount: r.mentionCount,
        })),
      ],
      capsuleEntities: mergeEntity.capsuleEntities.map((ce) => ({
        id: ce.id,
        capsuleId: ce.capsuleId,
        entityId: ce.entityId,
        role: ce.role,
        confidenceScore: ce.confidenceScore,
        createdAt: ce.createdAt,
      })),
    };
  }

  /**
   * 迁移关系
   *
   * @param tx - Prisma 事务客户端
   * @param keepEntity - 保留实体
   * @param mergeEntity - 被合并实体
   * @param config - 迁移配置
   * @returns 迁移结果
   */
  private async migrateRelations(
    tx: Prisma.TransactionClient,
    keepEntity: EntityWithRelations,
    mergeEntity: EntityWithRelations,
    config: RelationMigrationConfig
  ): Promise<{
    migratedCount: number;
    skippedCount: number;
    migratedRelations: string[];
    skippedRelations: string[];
  }> {
    const migratedRelations: string[] = [];
    const skippedRelations: string[] = [];

    // 获取预览分析结果
    const preview = await this.analyzeRelationMigration(keepEntity, mergeEntity, config);

    // 迁移出站关系
    for (const relation of mergeEntity.relationsFrom) {
      const previewItem = preview.relationsToMigrate.find((r) => r.id === relation.id);
      if (!previewItem) {
        skippedRelations.push(relation.id);
        continue;
      }

      // 检查是否会导致自引用
      if (relation.toEntityId === keepEntity.id) {
        skippedRelations.push(relation.id);
        continue;
      }

      // 检查是否已存在相同关系
      const existing = await tx.relation.findFirst({
        where: {
          fromEntityId: keepEntity.id,
          toEntityId: relation.toEntityId,
          relationType: relation.relationType,
        },
      });

      if (existing) {
        // 更新现有关系的强度
        await tx.relation.update({
          where: { id: existing.id },
          data: {
            strength: Math.max(existing.strength, relation.strength),
            mentionCount: existing.mentionCount + relation.mentionCount,
            lastSeenAt: new Date(),
          },
        });
        // 删除旧关系
        await tx.relation.delete({ where: { id: relation.id } });
      } else {
        // 更新关系指向
        await tx.relation.update({
          where: { id: relation.id },
          data: { fromEntityId: keepEntity.id },
        });
      }

      migratedRelations.push(relation.id);
    }

    // 迁移入站关系
    for (const relation of mergeEntity.relationsTo) {
      const previewItem = preview.relationsToMigrate.find((r) => r.id === relation.id);
      if (!previewItem) {
        skippedRelations.push(relation.id);
        continue;
      }

      // 检查是否会导致自引用
      if (relation.fromEntityId === keepEntity.id) {
        skippedRelations.push(relation.id);
        continue;
      }

      // 检查是否已存在相同关系
      const existing = await tx.relation.findFirst({
        where: {
          fromEntityId: relation.fromEntityId,
          toEntityId: keepEntity.id,
          relationType: relation.relationType,
        },
      });

      if (existing) {
        // 更新现有关系的强度
        await tx.relation.update({
          where: { id: existing.id },
          data: {
            strength: Math.max(existing.strength, relation.strength),
            mentionCount: existing.mentionCount + relation.mentionCount,
            lastSeenAt: new Date(),
          },
        });
        // 删除旧关系
        await tx.relation.delete({ where: { id: relation.id } });
      } else {
        // 更新关系指向
        await tx.relation.update({
          where: { id: relation.id },
          data: { toEntityId: keepEntity.id },
        });
      }

      migratedRelations.push(relation.id);
    }

    return {
      migratedCount: migratedRelations.length,
      skippedCount: skippedRelations.length,
      migratedRelations,
      skippedRelations,
    };
  }

  /**
   * 合并别名
   *
   * @param tx - Prisma 事务客户端
   * @param keepEntity - 保留实体
   * @param mergeEntity - 被合并实体
   * @returns 合并后的别名列表
   */
  private async mergeAliases(
    tx: Prisma.TransactionClient,
    keepEntity: Entity,
    mergeEntity: Entity
  ): Promise<string[]> {
    // 从两个实体中提取所有别名
    const keepAliases = this.extractAliases(keepEntity);
    const mergeAliases = this.extractAliases(mergeEntity);

    // 合并并去重（保留大小写）
    const mergedAliases = new Set<string>([...keepAliases, ...mergeAliases]);

    // 找出新增的别名
    const newAliases = mergeAliases.filter(
      (alias) => !keepAliases.some((a) => a.toLowerCase() === alias.toLowerCase())
    );

    // 更新保留实体的别名列表
    if (mergedAliases.size > 0) {
      await tx.entity.update({
        where: { id: keepEntity.id },
        data: {
          aliases: Array.from(mergedAliases),
        },
      });
    }

    // 同时更新描述，包含合并的别名信息（向后兼容）
    if (newAliases.length > 0) {
      const aliasNote = `Also known as: ${newAliases.join(', ')}`;
      const newDescription = keepEntity.description
        ? `${keepEntity.description}\n${aliasNote}`
        : aliasNote;

      await tx.entity.update({
        where: { id: keepEntity.id },
        data: { description: newDescription },
      });
    }

    return Array.from(mergedAliases);
  }

  /**
   * 从实体中提取别名
   *
   * 优先使用数据库中的 aliases 字段，如果没有则从描述中提取
   *
   * @param entity - 实体
   * @returns 别名列表
   */
  private extractAliases(entity: Entity): string[] {
    const aliases = new Set<string>();

    // 添加规范名称
    aliases.add(entity.canonicalName);

    // 优先使用数据库中的 aliases 字段
    if (entity.aliases && Array.isArray(entity.aliases)) {
      entity.aliases.forEach((alias) => aliases.add(alias));
    }

    // 从描述中提取别名（向后兼容）
    if (entity.description) {
      const akaMatch = entity.description.match(/also known as["']?([^\n]+)/i);
      if (akaMatch) {
        const akaList = akaMatch[1]
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        akaList.forEach((alias) => aliases.add(alias));
      }
    }

    return Array.from(aliases);
  }

  /**
   * 合并标签
   *
   * @param tx - Prisma 事务客户端
   * @param keepEntity - 保留实体
   * @param mergeEntity - 被合并实体
   * @returns 合并后的标签列表
   */
  private async mergeTags(
    tx: Prisma.TransactionClient,
    keepEntity: Entity,
    mergeEntity: Entity
  ): Promise<string[]> {
    // 获取被合并实体的胶囊关联
    const mergeCapsuleEntities = await tx.capsuleEntity.findMany({
      where: { entityId: mergeEntity.id },
      select: { capsuleId: true },
    });

    const mergeCapsuleIds = mergeCapsuleEntities.map((ce) => ce.capsuleId);

    if (mergeCapsuleIds.length === 0) {
      return [];
    }

    // 获取这些胶囊的标签
    const capsuleTags = await tx.capsuleTag.findMany({
      where: { capsuleId: { in: mergeCapsuleIds } },
      include: { tag: true },
    });

    // 获取保留实体已有的胶囊ID
    const keepCapsuleEntities = await tx.capsuleEntity.findMany({
      where: { entityId: keepEntity.id },
      select: { capsuleId: true },
    });

    const keepCapsuleIds = new Set(keepCapsuleEntities.map((ce) => ce.capsuleId));

    // 找出需要迁移标签的胶囊（保留实体没有的）
    const capsulesNeedingTags = mergeCapsuleIds.filter(
      (id) => !keepCapsuleIds.has(id)
    );

    // 收集标签名称
    const tagNames: string[] = [];
    const seen = new Set<string>();
    for (const ct of capsuleTags) {
      if (!seen.has(ct.tag.name)) {
        seen.add(ct.tag.name);
        tagNames.push(ct.tag.name);
      }
    }

    // 为这些胶囊添加标签
    for (const capsuleId of capsulesNeedingTags) {
      for (const tagName of tagNames) {
        // 查找或创建标签
        let tag = await tx.tag.findUnique({
          where: { name: tagName },
        });

        if (!tag) {
          tag = await tx.tag.create({
            data: { name: tagName },
          });
        }

        // 检查是否已存在关联
        const existing = await tx.capsuleTag.findFirst({
          where: {
            capsuleId,
            tagId: tag.id,
          },
        });

        if (!existing) {
          await tx.capsuleTag.create({
            data: {
              capsuleId,
              tagId: tag.id,
            },
          });
        }
      }
    }

    return tagNames;
  }

  /**
   * 更新引用
   *
   * @param tx - Prisma 事务客户端
   * @param keepEntity - 保留实体
   * @param mergeEntity - 被合并实体
   * @returns 更新结果
   */
  private async updateReferences(
    tx: Prisma.TransactionClient,
    keepEntity: Entity,
    mergeEntity: Entity
  ): Promise<{ capsuleEntityCount: number; embeddingCount: number }> {
    // 更新 CapsuleEntity 关联
    const capsuleEntityResult = await tx.capsuleEntity.updateMany({
      where: { entityId: mergeEntity.id },
      data: { entityId: keepEntity.id },
    });

    // 更新 Embedding 记录
    const embeddingResult = await tx.embedding.updateMany({
      where: { objectId: mergeEntity.id, objectType: 'ENTITY' },
      data: { objectId: keepEntity.id },
    });

    return {
      capsuleEntityCount: capsuleEntityResult.count,
      embeddingCount: embeddingResult.count,
    };
  }

  /**
   * 合并描述
   *
   * @param descA - 描述A
   * @param descB - 描述B
   * @returns 合并后的描述
   */
  private mergeDescriptions(descA: string | null, descB: string | null): string | undefined {
    if (!descA && !descB) {
      return undefined;
    }
    if (!descA) {
      return descB || undefined;
    }
    if (!descB) {
      return descA;
    }

    // 如果描述相同，返回其中一个
    if (descA === descB) {
      return descA;
    }

    // 合并描述（使用换行分隔）
    return `${descA}\n\n(合并自另一实体: ${descB})`;
  }

  /**
   * 记录合并操作日志
   *
   * @param tx - Prisma 事务客户端
   * @param entry - 日志条目
   */
  private async logMergeOperation(
    tx: Prisma.TransactionClient,
    entry: Omit<MergeLogEntry, 'id' | 'createdAt'>
  ): Promise<void> {
    // 将日志持久化到 MergeLog 表
    await tx.mergeLog.create({
      data: {
        operation: entry.operation as 'PREVIEW' | 'MERGE' | 'ROLLBACK',
        keepEntityId: entry.keepEntityId,
        mergeEntityId: entry.mergeEntityId,
        taskId: entry.taskId,
        userId: entry.userId,
        snapshot: (entry.snapshot || {}) as unknown as Prisma.InputJsonValue,
        details: (entry.details || {}) as unknown as Prisma.InputJsonValue,
        success: entry.success ?? true,
        errorMessage: entry.errorMessage,
      },
    });

    // 同时输出到控制台用于调试
    console.log('[MergeLog]', {
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * 默认实体合并服务实例
 */
export const mergeService = new MergeService();
