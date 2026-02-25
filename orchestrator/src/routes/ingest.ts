import { PrismaClient, CapsuleStatus } from '@prisma/client';
import { CrawlerService } from '../services/crawler';
import express from 'express';
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
        sourceTypes: ['WEBSITE'],
        rawContent: `Title: ${title}\nURL: ${url}\n\n${content}`,
        summary: title
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
