import { distance as levenshteinDistance } from 'fast-levenshtein';
import { distance as jaroWinklerDistance } from 'jaro-winkler';

/**
 * 相似度权重配置接口
 */
export interface SimilarityWeights {
  /** 名称相似度权重 */
  name: number;
  /** 别名重叠度权重 */
  alias: number;
  /** 语义相似度权重 */
  semantic: number;
  /** 上下文相似度权重 */
  context: number;
  /** 类型匹配权重 */
  type: number;
}

/**
 * 默认相似度权重配置
 * - name: 0.25 - 名称相似度
 * - alias: 0.15 - 别名重叠度
 * - semantic: 0.35 - 语义相似度
 * - context: 0.15 - 上下文相似度
 * - type: 0.10 - 类型匹配
 */
export const DEFAULT_WEIGHTS: SimilarityWeights = {
  name: 0.25,
  alias: 0.15,
  semantic: 0.35,
  context: 0.15,
  type: 0.10,
};

/**
 * 实体数据结构接口
 */
export interface EntityData {
  /** 实体唯一标识 */
  id: string;
  /** 实体名称 */
  name: string;
  /** 实体类型 */
  type: string;
  /** 实体别名列表 */
  aliases: string[];
  /** 语义向量嵌入 */
  embedding?: number[];
  /** 关联实体ID列表 */
  relatedEntities: string[];
}

/**
 * 相似实体对结果接口
 */
export interface SimilarPair {
  /** 实体A */
  entityA: EntityData;
  /** 实体B */
  entityB: EntityData;
  /** 综合相似度得分 (0-1) */
  similarity: number;
  /** 各维度相似度详情 */
  details?: SimilarityDetails;
}

/**
 * 各维度相似度详情
 */
export interface SimilarityDetails {
  /** 名称相似度 */
  nameSimilarity: number;
  /** 别名重叠度 */
  aliasOverlap: number;
  /** 语义相似度 */
  semanticSimilarity: number;
  /** 上下文相似度 */
  contextSimilarity: number;
  /** 类型匹配度 */
  typeMatch: number;
}

/**
 * 实体相似度计算服务
 * 
 * 提供多种相似度计算算法:
 * - 名称相似度: 基于 Levenshtein 距离和 Jaro-Winkler 相似度
 * - 别名重叠度: 基于 Jaccard 系数
 * - 语义相似度: 基于向量余弦相似度
 * - 上下文相似度: 基于共现实体的 Jaccard 系数
 * - 类型匹配: 二元匹配
 * 
 * 支持可配置的权重组合计算综合相似度
 */
export class SimilarityService {
  private weights: SimilarityWeights;

  /**
   * 创建相似度服务实例
   * @param weights - 相似度权重配置，默认为 DEFAULT_WEIGHTS
   */
  constructor(weights: SimilarityWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
    this.validateWeights();
  }

  /**
   * 验证权重配置是否合法
   * @throws Error 当权重总和不为1时抛出
   */
  private validateWeights(): void {
    const sum = Object.values(this.weights).reduce((acc, w) => acc + w, 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error(
        `权重总和必须等于1.0，当前总和: ${sum.toFixed(3)}`
      );
    }
  }

  /**
   * 更新权重配置
   * @param weights - 新的权重配置
   */
  updateWeights(weights: SimilarityWeights): void {
    this.weights = weights;
    this.validateWeights();
  }

  /**
   * 获取当前权重配置
   * @returns 当前权重配置
   */
  getWeights(): SimilarityWeights {
    return { ...this.weights };
  }

  /**
   * 计算两个实体之间的综合相似度
   * 
   * 综合相似度 = Σ(各维度相似度 × 对应权重)
   * 
   * @param entityA - 实体A
   * @param entityB - 实体B
   * @returns 综合相似度得分 (0-1)，保留两位小数
   */
  calculateSimilarity(entityA: EntityData, entityB: EntityData): number {
    const nameSim = this.calculateNameSimilarity(entityA.name, entityB.name);
    const aliasSim = this.calculateAliasOverlap(entityA.aliases, entityB.aliases);
    const semanticSim = this.calculateSemanticSimilarity(
      entityA.embedding,
      entityB.embedding
    );
    const contextSim = this.calculateContextSimilarity(
      entityA.relatedEntities,
      entityB.relatedEntities
    );
    const typeSim = entityA.type === entityB.type ? 1.0 : 0.0;

    const totalSim =
      nameSim * this.weights.name +
      aliasSim * this.weights.alias +
      semanticSim * this.weights.semantic +
      contextSim * this.weights.context +
      typeSim * this.weights.type;

    return Math.round(totalSim * 100) / 100;
  }

  /**
   * 计算两个实体之间的详细相似度
   * 
   * @param entityA - 实体A
   * @param entityB - 实体B
   * @returns 包含各维度相似度的详细结果
   */
  calculateSimilarityWithDetails(
    entityA: EntityData,
    entityB: EntityData
  ): SimilarPair {
    const nameSim = this.calculateNameSimilarity(entityA.name, entityB.name);
    const aliasSim = this.calculateAliasOverlap(entityA.aliases, entityB.aliases);
    const semanticSim = this.calculateSemanticSimilarity(
      entityA.embedding,
      entityB.embedding
    );
    const contextSim = this.calculateContextSimilarity(
      entityA.relatedEntities,
      entityB.relatedEntities
    );
    const typeSim = entityA.type === entityB.type ? 1.0 : 0.0;

    const totalSim =
      nameSim * this.weights.name +
      aliasSim * this.weights.alias +
      semanticSim * this.weights.semantic +
      contextSim * this.weights.context +
      typeSim * this.weights.type;

    return {
      entityA,
      entityB,
      similarity: Math.round(totalSim * 100) / 100,
      details: {
        nameSimilarity: Math.round(nameSim * 100) / 100,
        aliasOverlap: Math.round(aliasSim * 100) / 100,
        semanticSimilarity: Math.round(semanticSim * 100) / 100,
        contextSimilarity: Math.round(contextSim * 100) / 100,
        typeMatch: typeSim,
      },
    };
  }

  /**
   * 计算名称相似度
   * 
   * 算法步骤:
   * 1. 标准化名称(小写、去除空格和标点)
   * 2. 精确匹配返回 1.0
   * 3. 子串匹配返回 0.9
   * 4. 计算 Levenshtein 相似度: 1 - (编辑距离 / 最大长度)
   * 5. 计算 Jaro-Winkler 相似度
   * 6. 返回两者最大值
   * 
   * @param nameA - 名称A
   * @param nameB - 名称B
   * @returns 名称相似度 (0-1)
   */
  calculateNameSimilarity(nameA: string, nameB: string): number {
    const normA = this.normalize(nameA);
    const normB = this.normalize(nameB);

    // 精确匹配
    if (normA === normB) return 1.0;

    // 空字符串检查
    if (normA.length === 0 || normB.length === 0) return 0.0;

    // 子串匹配
    if (normA.includes(normB) || normB.includes(normA)) return 0.9;

    // Levenshtein 相似度
    const maxLen = Math.max(normA.length, normB.length);
    const levDist = levenshteinDistance(normA, normB);
    const levSim = 1 - levDist / maxLen;

    // Jaro-Winkler 相似度 (使用 jaro-winkler 库)
    const jaroSim = jaroWinklerDistance(normA, normB);

    // 返回最大值
    return Math.max(levSim, jaroSim);
  }

  /**
   * 计算别名重叠度 (Jaccard 系数)
   * 
   * Jaccard(A, B) = |A ∩ B| / |A ∪ B|
   * 
   * @param aliasesA - 实体A的别名列表
   * @param aliasesB - 实体B的别名列表
   * @returns 别名重叠度 (0-1)
   */
  calculateAliasOverlap(aliasesA: string[], aliasesB: string[]): number {
    const setA = new Set(aliasesA.map((a) => this.normalize(a)));
    const setB = new Set(aliasesB.map((b) => this.normalize(b)));

    const intersection = new Set(Array.from(setA).filter((x) => setB.has(x)));
    const union = new Set(Array.from(setA).concat(Array.from(setB)));

    if (union.size === 0) return 0.0;

    return intersection.size / union.size;
  }

  /**
   * 计算语义相似度 (向量余弦相似度)
   * 
   * cos(θ) = (A · B) / (||A|| × ||B||)
   * 
   * @param embeddingA - 实体A的向量嵌入
   * @param embeddingB - 实体B的向量嵌入
   * @returns 语义相似度 (0-1)，无嵌入时返回 0
   */
  calculateSemanticSimilarity(
    embeddingA?: number[],
    embeddingB?: number[]
  ): number {
    if (!embeddingA || !embeddingB) return 0.0;
    if (embeddingA.length !== embeddingB.length) return 0.0;
    if (embeddingA.length === 0) return 0.0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < embeddingA.length; i++) {
      dotProduct += embeddingA[i] * embeddingB[i];
      normA += embeddingA[i] * embeddingA[i];
      normB += embeddingB[i] * embeddingB[i];
    }

    if (normA === 0 || normB === 0) return 0.0;

    // 计算余弦相似度
    // 注意：假设向量已经归一化，结果在 [0, 1] 范围内
    // 如果向量未归一化，结果可能在 [-1, 1]，需要映射到 [0, 1]
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    
    // 将 [-1, 1] 映射到 [0, 1]，确保结果非负
    return Math.max(0, Math.min(1, (similarity + 1) / 2));
  }

  /**
   * 计算上下文相似度 (共现实体的 Jaccard 系数)
   * 
   * 基于两个实体共有的关联实体计算相似度
   * 
   * @param relatedA - 实体A的关联实体ID列表
   * @param relatedB - 实体B的关联实体ID列表
   * @returns 上下文相似度 (0-1)
   */
  calculateContextSimilarity(
    relatedA: string[],
    relatedB: string[]
  ): number {
    const setA = new Set(relatedA);
    const setB = new Set(relatedB);

    const intersection = new Set(Array.from(setA).filter((x) => setB.has(x)));
    const union = new Set(Array.from(setA).concat(Array.from(setB)));

    if (union.size === 0) return 0.0;

    return intersection.size / union.size;
  }

  /**
   * 计算 Jaccard 相似度系数
   * 
   * @param setA - 集合A
   * @param setB - 集合B
   * @returns Jaccard 系数 (0-1)
   */
  calculateJaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
    if (setA.size === 0 && setB.size === 0) return 1.0;
    
    const intersection = new Set(Array.from(setA).filter((x) => setB.has(x)));
    const union = new Set(Array.from(setA).concat(Array.from(setB)));

    return intersection.size / union.size;
  }

  /**
   * 标准化字符串用于比较
   * 
   * 转换步骤:
   * 1. 转换为小写
   * 2. 去除所有空格
   * 3. 去除所有标点符号
   * 4. 去除首尾空白
   * 
   * @param str - 原始字符串
   * @returns 标准化后的字符串
   */
  normalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/[\s!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/g, '') // 去除空格和标点符号
      .trim();
  }

  /**
   * 计算 Levenshtein 距离
   * 
   * 使用 fast-levenshtein 库计算两个字符串的编辑距离
   * 
   * @param strA - 字符串A
   * @param strB - 字符串B
   * @returns 编辑距离
   */
  calculateLevenshteinDistance(strA: string, strB: string): number {
    return levenshteinDistance(strA, strB);
  }

  /**
   * 计算 Jaro-Winkler 相似度
   * 
   * 使用 jaro-winkler 库计算相似度
   * 对前缀匹配给予额外权重，适合名称匹配
   * 
   * 注意：jaro-winkler 库的 distance 函数返回的是相似度 (0-1)，
   * 而非距离。值越大表示越相似。
   * 
   * @param strA - 字符串A
   * @param strB - 字符串B
   * @returns Jaro-Winkler 相似度 (0-1)
   */
  calculateJaroWinklerSimilarity(strA: string, strB: string): number {
    return jaroWinklerDistance(strA, strB);
  }

  /**
   * 从实体列表中查找相似实体对
   * 
   * 使用 O(n²) 算法比较所有实体对
   * 
   * @param entities - 实体列表
   * @param threshold - 相似度阈值 (默认 0.7)
   * @param includeDetails - 是否包含详细相似度信息
   * @returns 相似实体对列表，按相似度降序排列
   */
  async findSimilarPairs(
    entities: EntityData[],
    threshold = 0.7,
    includeDetails = false
  ): Promise<SimilarPair[]> {
    const pairs: SimilarPair[] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const pair = includeDetails
          ? this.calculateSimilarityWithDetails(entities[i], entities[j])
          : {
              entityA: entities[i],
              entityB: entities[j],
              similarity: this.calculateSimilarity(entities[i], entities[j]),
            };

        if (pair.similarity >= threshold) {
          pairs.push(pair);
        }
      }
    }

    // 按相似度降序排列
    return pairs.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * 批量处理相似度计算
   * 
   * 使用滑动窗口避免 O(n²) 内存占用
   * 适合处理大规模实体列表
   * 
   * @param entities - 实体列表
   * @param callback - 每批结果回调函数
   * @param batchSize - 批处理大小 (默认 100)
   * @param threshold - 相似度阈值 (默认 0.7)
   */
  async processSimilarityBatch(
    entities: EntityData[],
    callback: (pairs: SimilarPair[]) => Promise<void>,
    batchSize = 100,
    threshold = 0.7
  ): Promise<void> {
    // 使用滑动窗口避免 O(n²) 内存占用
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);

      // 当前批次内部比较
      const internalPairs = await this.calculateSimilarityBatch(
        batch,
        batch,
        threshold,
        true
      );
      if (internalPairs.length > 0) {
        await callback(internalPairs);
      }

      // 与后续批次比较
      for (let j = i + batchSize; j < entities.length; j += batchSize) {
        const compareBatch = entities.slice(j, j + batchSize);
        const pairs = await this.calculateSimilarityBatch(
          batch,
          compareBatch,
          threshold
        );

        if (pairs.length > 0) {
          await callback(pairs);
        }
      }
    }
  }

  /**
   * 计算两个批次之间的相似度
   * 
   * @param batchA - 批次A
   * @param batchB - 批次B
   * @param threshold - 相似度阈值
   * @param skipSameIndex - 是否跳过相同索引(用于同一批次内部比较)
   * @returns 相似实体对列表
   */
  private async calculateSimilarityBatch(
    batchA: EntityData[],
    batchB: EntityData[],
    threshold = 0.7,
    skipSameIndex = false
  ): Promise<SimilarPair[]> {
    const pairs: SimilarPair[] = [];

    for (let i = 0; i < batchA.length; i++) {
      const entityA = batchA[i];
      const startJ = skipSameIndex ? i + 1 : 0;

      for (let j = startJ; j < batchB.length; j++) {
        const entityB = batchB[j];

        // 如果是同一批次且相同实体，跳过
        if (skipSameIndex && entityA.id === entityB.id) continue;

        const similarity = this.calculateSimilarity(entityA, entityB);
        if (similarity >= threshold) {
          pairs.push({ entityA, entityB, similarity });
        }
      }
    }

    return pairs;
  }

  /**
   * 查找与给定实体最相似的实体
   * 
   * @param target - 目标实体
   * @param candidates - 候选实体列表
   * @param topK - 返回最相似的前K个 (默认 5)
   * @param threshold - 相似度阈值 (默认 0.5)
   * @returns 最相似的实体对列表
   */
  async findMostSimilar(
    target: EntityData,
    candidates: EntityData[],
    topK = 5,
    threshold = 0.5
  ): Promise<SimilarPair[]> {
    const pairs: SimilarPair[] = [];

    for (const candidate of candidates) {
      // 跳过自身
      if (target.id === candidate.id) continue;

      const similarity = this.calculateSimilarity(target, candidate);
      if (similarity >= threshold) {
        pairs.push({
          entityA: target,
          entityB: candidate,
          similarity,
        });
      }
    }

    // 按相似度降序排列并取前K个
    return pairs
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
}

/**
 * 默认相似度服务实例
 */
export const similarityService = new SimilarityService();
