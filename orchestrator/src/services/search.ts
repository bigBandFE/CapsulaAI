import { PrismaClient } from '@prisma/client';
import { generateEmbedding } from './embedding';

const prisma = new PrismaClient();

export interface SearchFilters {
  sourceType?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  entities?: string[];
}

export interface SearchResult {
  capsule: {
    id: string;
    createdAt: Date;
    title: string;
    summary?: string;
    sourceTypes: string[];
  };
  score: number;
  relevantChunk: string;
}

export class SearchService {
  /**
   * Semantic search using vector similarity
   */
  static async semanticSearch(
    query: string,
    limit: number = 10,
    threshold: number = 0.7,
    filters?: SearchFilters
  ): Promise<SearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // Build WHERE clause for filters
    let whereConditions: string[] = ['c.status = \'COMPLETED\''];

    if (filters?.sourceType && filters.sourceType.length > 0) {
      const types = filters.sourceType.map(t => `'${t}'`).join(',');
      whereConditions.push(`c."sourceTypes" && ARRAY[${types}]`); // Postgres array intersection
    }

    if (filters?.dateRange) {
      whereConditions.push(`c."createdAt" >= '${filters.dateRange.start.toISOString()}'`);
      whereConditions.push(`c."createdAt" <= '${filters.dateRange.end.toISOString()}'`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Vector similarity search
    const sqlQuery = `
      SELECT 
        c.id,
        c."createdAt",
        c."sourceTypes",
        c."summary",
        c."rawContent",
        (e.vector <=> '${vectorStr}'::vector) as distance
      FROM "Capsule" c
      JOIN "Embedding" e ON e."objectId" = c.id AND e."objectType" = 'CAPSULE'::"ObjectType"
      WHERE ${whereClause}
      ORDER BY distance ASC
      LIMIT ${limit * 2}
    `;

    let results = await prisma.$queryRawUnsafe<Array<{
      id: string;
      createdAt: Date;
      sourceTypes: string[];
      summary: string;
      rawContent: string;
      distance: number;
    }>>(sqlQuery);

    // Filter by entity if specified
    if (filters?.entities && filters.entities.length > 0) {
      const capsuleIds = results.map(r => r.id);

      const entityFiltered = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT c.id
        FROM "Capsule" c
        JOIN "CapsuleEntity" ce ON c.id = ce."capsuleId"
        JOIN "Entity" e ON ce."entityId" = e.id
        WHERE c.id = ANY(${capsuleIds})
          AND e."canonicalName" = ANY(${filters.entities})
      `;

      const filteredIds = new Set(entityFiltered.map(r => r.id));
      results = results.filter(r => filteredIds.has(r.id));
    }

    // Convert distance to similarity score and filter by threshold
    const searchResults: SearchResult[] = results
      .map(r => ({
        capsule: {
          id: r.id,
          createdAt: r.createdAt,
          title: r.summary || 'Untitled',
          summary: r.summary,
          sourceTypes: r.sourceTypes
        },
        score: 1 - r.distance, // Convert distance to similarity
        relevantChunk: r.rawContent?.substring(0, 200) || ''
      }))
      .filter(r => r.score >= threshold)
      .slice(0, limit);

    return searchResults;
  }

  /**
   * Search by entity name
   */
  static async searchByEntity(entityName: string, entityType?: string, limit: number = 10) {
    const where: any = {
      capsuleEntities: {
        some: {
          entity: {
            canonicalName: entityName
          }
        }
      },
      status: 'COMPLETED'
    };

    if (entityType) {
      where.capsuleEntities.some.entity.type = entityType;
    }

    const capsules = await prisma.capsule.findMany({
      where,
      include: {
        capsuleEntities: { include: { entity: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return capsules.map(c => ({
      capsule: {
        id: c.id,
        createdAt: c.createdAt,
        title: c.summary || 'Untitled',
        summary: c.summary,
        sourceTypes: c.sourceTypes
      },
      score: 1.0, // Exact entity match
      relevantChunk: c.rawContent?.substring(0, 200) || ''
    }));
  }

  /**
   * Search for pending actions (TODOs)
   */
  static async searchActions(actionType: 'TODO' | 'REMINDER' | 'FOLLOW_UP' = 'TODO', limit: number = 20) {
    // Use raw query
    const capsules = await prisma.$queryRaw<Array<{
      id: string;
      createdAt: Date;
      sourceTypes: string[];
      summary: string;
      rawContent: string;
    }>>`
      SELECT id, "createdAt", "sourceTypes", "summary", "rawContent"
      FROM "Capsule"
      WHERE status = 'COMPLETED'
        AND "rawContent" ILIKE '%todo%'
      ORDER BY "createdAt" DESC
      LIMIT 100
    `;

    const results: SearchResult[] = [];

    for (const capsule of capsules) {
      // Dummy logic for extracting actions, as structuredData was removed
      const actions: any[] = [];
      const matchingActions = actions.filter((a: any) => a.type === actionType);

      if (matchingActions.length > 0) {
        results.push({
          capsule: {
            id: capsule.id,
            createdAt: capsule.createdAt,
            title: capsule.summary || 'Untitled',
            summary: matchingActions.map((a: any) => a.description).join(', '),
            sourceTypes: capsule.sourceTypes
          },
          score: 1.0,
          relevantChunk: matchingActions.map((a: any) =>
            `[${a.type}] ${a.description}${a.deadline ? ` (Due: ${a.deadline})` : ''}`
          ).join('\n')
        });
      }

      if (results.length >= limit) break;
    }

    return results.slice(0, limit);
  }
}
