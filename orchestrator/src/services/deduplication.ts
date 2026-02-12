import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DeduplicationService {
  /**
   * Generate SHA-256 hash of content for exact duplicate detection
   */
  static generateContentHash(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content.trim().toLowerCase()) // Normalize: trim + lowercase
      .digest('hex');
  }

  /**
   * Check if content already exists (exact duplicate)
   * Returns existing Capsule if found, null otherwise
   */
  static async findExactDuplicate(content: string) {
    const hash = this.generateContentHash(content);

    const existing = await prisma.capsule.findUnique({
      where: { contentHash: hash },
      include: {
        entities: true,
        assets: true
      }
    });

    return existing;
  }

  /**
   * Find similar capsules using vector similarity
   * @param embedding - Vector embedding of the content
   * @param threshold - Similarity threshold (0.0 - 1.0), default 0.95
   * @returns Array of similar capsules with similarity scores
   */
  static async findSimilarCapsules(
    embedding: number[],
    threshold: number = 0.95
  ): Promise<Array<{ id: string; score: number }>> {
    // Using pgvector's cosine similarity operator (<=>)
    // Lower distance = higher similarity
    // We convert: similarity = 1 - distance

    const results = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT 
        c.id,
        (e.vector <=> ${`[${embedding.join(',')}]`}::vector) as distance
      FROM "Capsule" c
      JOIN "Embedding" e ON e."capsuleId" = c.id
      WHERE c.status = 'COMPLETED'
      ORDER BY distance ASC
      LIMIT 5
    `;

    // Convert distance to similarity score and filter by threshold
    return results
      .map(r => ({
        id: r.id,
        score: 1 - r.distance
      }))
      .filter(r => r.score >= threshold && r.score < 0.999); // Exclude self (score ~1.0)
  }

  /**
   * Mark a capsule as similar to another
   */
  static async markAsSimilar(
    capsuleId: string,
    similarToId: string,
    score: number
  ) {
    await prisma.capsule.update({
      where: { id: capsuleId },
      data: {
        similarTo: similarToId,
        similarityScore: score
      }
    });

    console.log(`[Dedup] Capsule ${capsuleId} marked as similar to ${similarToId} (score: ${score.toFixed(3)})`);
  }

  /**
   * Get all duplicates/similar capsules for a given capsule
   */
  static async getSimilarCapsules(capsuleId: string) {
    // Find capsules that reference this one
    const referencingThis = await prisma.capsule.findMany({
      where: { similarTo: capsuleId },
      select: {
        id: true,
        createdAt: true,
        similarityScore: true,
        structuredData: true
      }
    });

    // Find what this capsule references
    const capsule = await prisma.capsule.findUnique({
      where: { id: capsuleId },
      select: {
        similarTo: true,
        similarityScore: true
      }
    });

    const result: any = {
      referencedBy: referencingThis
    };

    if (capsule?.similarTo) {
      const referenced = await prisma.capsule.findUnique({
        where: { id: capsule.similarTo },
        select: {
          id: true,
          createdAt: true,
          structuredData: true
        }
      });

      result.references = {
        ...referenced,
        similarityScore: capsule.similarityScore
      };
    }

    return result;
  }
}
