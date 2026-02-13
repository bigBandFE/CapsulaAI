import express from 'express';
import { PrismaClient, CapsuleStatus, SourceType } from '@prisma/client';
import { CrawlerService } from '../services/crawler';

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/ingest/url
router.post('/url', async (req, res) => {
  try {
    const { url, tags } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // 1. Crawl the URL
    console.log(`[Ingest] Crawling URL: ${url}`);
    const { title, content } = await CrawlerService.crawl(url);

    // 2. Create Capsule
    const capsule = await prisma.capsule.create({
      data: {
        status: CapsuleStatus.PENDING,
        sourceType: SourceType.WEBSITE,
        originalContent: content, // Markdown/Text content
        structuredData: {
          meta: {
            title: title,
            source_url: url,
            created_at: new Date().toISOString()
          },
          tags: tags || []
        }
      }
    });

    console.log(`[Ingest] Created Capsule ${capsule.id} from URL`);
    res.json(capsule);

  } catch (error) {
    console.error('[Ingest] Error processing URL:', error);
    res.status(500).json({ error: 'Failed to ingest URL', details: (error as Error).message });
  }
});

export default router;
