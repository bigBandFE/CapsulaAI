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

  static async findExactDuplicate(content: string): Promise<any> {
    // V1 removed contentHash from Capsule, deduplication is handled at the Entity layer.
    // Return null to allow capsule creation.
    return null;
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

  static async markAsSimilar(
    capsuleId: string,
    similarToId: string,
    score: number
  ) {
    // V1 removed similarTo from Capsule
    console.log(`[Dedup] Capsule ${capsuleId} marked as similar to ${similarToId} (score: ${score.toFixed(3)})`);
  }

  static async getSimilarCapsules(capsuleId: string) {
    // Return empty for V1 since we rely on Graph relations, not Capsule-to-Capsule deduplication
    return { referencedBy: [] };
  }
}
