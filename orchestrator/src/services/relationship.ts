import { PrismaClient, RelationshipType } from '@prisma/client';
import { Relationship as RelationshipData } from '../ai/schemas';

const prisma = new PrismaClient();

export interface CreateRelationshipInput {
  fromEntityId: string;
  toEntityId: string;
  type: RelationshipType;
  confidence: number;
  capsuleId: string;
  metadata?: any;
}

export class RelationshipService {
  /**
   * Extract and store relationships from capsule structured data
   */
  static async extractFromCapsule(capsuleId: string, relationships: RelationshipData[]) {
    if (!relationships || relationships.length === 0) {
      return [];
    }

    const created: any[] = [];

    for (const rel of relationships) {
      try {
        // Find or create entities
        const fromEntity = await prisma.entity.upsert({
          where: {
            name_type: {
              name: rel.from,
              type: rel.fromType
            }
          },
          create: {
            name: rel.from,
            type: rel.fromType
          },
          update: {}
        });

        const toEntity = await prisma.entity.upsert({
          where: {
            name_type: {
              name: rel.to,
              type: rel.toType
            }
          },
          create: {
            name: rel.to,
            type: rel.toType
          },
          update: {}
        });

        // Validate relationship type
        let relType = rel.type as RelationshipType;
        if (!Object.values(RelationshipType).includes(relType)) {
          console.warn(`Invalid relationship type: ${rel.type}. Falling back to OTHER.`);
          relType = RelationshipType.OTHER;
        }

        // Create relationship (upsert to avoid duplicates)
        const relationship = await prisma.relationship.upsert({
          where: {
            fromEntityId_toEntityId_type: {
              fromEntityId: fromEntity.id,
              toEntityId: toEntity.id,
              type: relType
            }
          },
          create: {
            fromEntityId: fromEntity.id,
            toEntityId: toEntity.id,
            type: relType,
            confidence: typeof rel.confidence === 'string' ? parseFloat(rel.confidence) : (rel.confidence || 1.0),
            capsuleId,
            metadata: rel.metadata as any
          },
          update: {
            // Update confidence if new one is higher
            confidence: (typeof rel.confidence === 'string' ? parseFloat(rel.confidence) : rel.confidence) > 0
              ? (typeof rel.confidence === 'string' ? parseFloat(rel.confidence) : rel.confidence)
              : undefined,
            metadata: rel.metadata as any
          },
          include: {
            fromEntity: true,
            toEntity: true
          }
        });

        created.push(relationship);
      } catch (error) {
        console.error(`Failed to create relationship ${rel.from} -> ${rel.to}:`, error);
      }
    }

    return created;
  }

  /**
   * Get all relationships for an entity
   */
  static async getEntityRelationships(
    entityId: string,
    type?: RelationshipType,
    direction?: 'from' | 'to' | 'both'
  ) {
    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (direction === 'from') {
      where.fromEntityId = entityId;
    } else if (direction === 'to') {
      where.toEntityId = entityId;
    } else {
      // Both directions
      where.OR = [
        { fromEntityId: entityId },
        { toEntityId: entityId }
      ];
    }

    const relationships = await prisma.relationship.findMany({
      where,
      include: {
        fromEntity: true,
        toEntity: true,
        capsule: {
          select: {
            id: true,
            structuredData: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        confidence: 'desc'
      }
    });

    return relationships.map(rel => ({
      id: rel.id,
      type: rel.type,
      direction: rel.fromEntityId === entityId ? 'from' : 'to',
      relatedEntity: rel.fromEntityId === entityId ? {
        id: rel.toEntity.id,
        name: rel.toEntity.name,
        type: rel.toEntity.type
      } : {
        id: rel.fromEntity.id,
        name: rel.fromEntity.name,
        type: rel.fromEntity.type
      },
      confidence: rel.confidence,
      metadata: rel.metadata,
      source: {
        capsuleId: rel.capsule.id,
        title: (rel.capsule.structuredData as any)?.meta?.title || 'Untitled',
        createdAt: rel.capsule.createdAt
      }
    }));
  }

  /**
   * Find shortest path between two entities
   */
  static async findPath(fromEntityId: string, toEntityId: string, maxDepth: number = 5) {
    // BFS to find shortest path
    const visited = new Set<string>();
    const queue: Array<{ entityId: string; path: any[] }> = [
      { entityId: fromEntityId, path: [] }
    ];

    while (queue.length > 0) {
      const { entityId, path } = queue.shift()!;

      if (entityId === toEntityId) {
        return path;
      }

      if (path.length >= maxDepth || visited.has(entityId)) {
        continue;
      }

      visited.add(entityId);

      // Get all relationships for this entity
      const relationships = await prisma.relationship.findMany({
        where: {
          OR: [
            { fromEntityId: entityId },
            { toEntityId: entityId }
          ]
        },
        include: {
          fromEntity: true,
          toEntity: true
        }
      });

      for (const rel of relationships) {
        const nextEntityId = rel.fromEntityId === entityId ? rel.toEntityId : rel.fromEntityId;
        const nextEntity = rel.fromEntityId === entityId ? rel.toEntity : rel.fromEntity;

        if (!visited.has(nextEntityId)) {
          queue.push({
            entityId: nextEntityId,
            path: [
              ...path,
              {
                entity: { id: entityId },
                relationship: { type: rel.type, confidence: rel.confidence },
                nextEntity: { id: nextEntity.id, name: nextEntity.name, type: nextEntity.type }
              }
            ]
          });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get all related entities within N hops
   */
  static async getRelatedEntities(entityId: string, depth: number = 2, type?: RelationshipType) {
    const visited = new Set<string>();
    const entities: any[] = [];
    const queue: Array<{ entityId: string; currentDepth: number }> = [
      { entityId, currentDepth: 0 }
    ];

    while (queue.length > 0) {
      const { entityId: currentId, currentDepth } = queue.shift()!;

      if (currentDepth > depth || visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      // Get entity details
      if (currentId !== entityId) {
        const entity = await prisma.entity.findUnique({
          where: { id: currentId }
        });

        if (entity) {
          entities.push({
            ...entity,
            depth: currentDepth
          });
        }
      }

      // Get relationships
      const where: any = {
        OR: [
          { fromEntityId: currentId },
          { toEntityId: currentId }
        ]
      };

      if (type) {
        where.type = type;
      }

      const relationships = await prisma.relationship.findMany({
        where,
        include: {
          fromEntity: true,
          toEntity: true
        }
      });

      for (const rel of relationships) {
        const nextEntityId = rel.fromEntityId === currentId ? rel.toEntityId : rel.fromEntityId;

        if (!visited.has(nextEntityId)) {
          queue.push({
            entityId: nextEntityId,
            currentDepth: currentDepth + 1
          });
        }
      }
    }

    return entities;
  }

  /**
   * Get relationship statistics
   */
  static async getStats() {
    const totalRelationships = await prisma.relationship.count();

    // Count by type
    const byType = await prisma.relationship.groupBy({
      by: ['type'],
      _count: true
    });

    const typeStats = byType.reduce((acc: any, item) => {
      acc[item.type] = item._count;
      return acc;
    }, {});

    // Top connected entities
    const topConnected = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      type: string;
      connectionCount: bigint;
    }>>`
      SELECT 
        e.id,
        e.name,
        e.type,
        COUNT(*) as "connectionCount"
      FROM "Entity" e
      LEFT JOIN "Relationship" r ON (r."fromEntityId" = e.id OR r."toEntityId" = e.id)
      GROUP BY e.id, e.name, e.type
      ORDER BY "connectionCount" DESC
      LIMIT 10
    `;

    return {
      totalRelationships,
      byType: typeStats,
      topConnectedEntities: topConnected.map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        connectionCount: Number(e.connectionCount)
      }))
    };
  }

  /**
   * Get visualization data for knowledge graph
   */
  static async getVisualizationData(entityId?: string, depth: number = 2) {
    let entities: any[];
    let relationships: any[];

    if (entityId) {
      // Get entities within N hops
      const relatedEntities = await this.getRelatedEntities(entityId, depth);
      const entityIds = [entityId, ...relatedEntities.map((e: any) => e.id)];

      entities = await prisma.entity.findMany({
        where: {
          id: { in: entityIds }
        }
      });

      // Get relationships between these entities
      relationships = await prisma.relationship.findMany({
        where: {
          AND: [
            { fromEntityId: { in: entityIds } },
            { toEntityId: { in: entityIds } }
          ]
        }
      });
    } else {
      // Get all entities and relationships (limited)
      entities = await prisma.entity.findMany({
        take: 100,
        orderBy: {
          createdAt: 'desc'
        }
      });

      const entityIds = entities.map(e => e.id);

      relationships = await prisma.relationship.findMany({
        where: {
          AND: [
            { fromEntityId: { in: entityIds } },
            { toEntityId: { in: entityIds } }
          ]
        },
        take: 200
      });
    }

    // Count connections for each entity
    const connectionCounts: { [key: string]: number } = {};
    relationships.forEach(rel => {
      connectionCounts[rel.fromEntityId] = (connectionCounts[rel.fromEntityId] || 0) + 1;
      connectionCounts[rel.toEntityId] = (connectionCounts[rel.toEntityId] || 0) + 1;
    });

    return {
      nodes: entities.map(e => ({
        id: e.id,
        label: e.name,
        type: e.type,
        connectionCount: connectionCounts[e.id] || 0
      })),
      edges: relationships.map(r => ({
        id: r.id,
        source: r.fromEntityId,
        target: r.toEntityId,
        type: r.type,
        confidence: r.confidence
      }))
    };
  }
}
