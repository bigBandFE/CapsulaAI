import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { SearchService } from '../services/search';
import { RAGService } from '../services/rag';
import { LLMConfig } from '../ai';

const router = Router();
const prisma = new PrismaClient();

// Initialize RAG service with local model config
const ragConfig: LLMConfig = {
  endpoint: process.env.LOCAL_MODEL_ENDPOINT || 'https://api.minimax.io/v1',
  modelName: process.env.LOCAL_MODEL_NAME || 'MiniMax-M2.5',
  apiKey: process.env.LOCAL_API_KEY || 'sk-api-hcwStRWpvcohgSUAA94N28Wnlf857Ly6HDecy-xCI_jLwOzUOZdMFKjftb0SHoud_q2eUxV529a1ulgP-3LcH6efxnGN_kckmpRUTIgdjh2dRZMUFh2Wa-c'
};

const ragService = new RAGService(ragConfig);

/**
 * POST /api/research/search
 * Semantic search across all capsules
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10, threshold = 0.7, filters } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    // Parse filters if provided
    let parsedFilters;
    if (filters) {
      parsedFilters = {
        sourceType: filters.sourceType,
        entities: filters.entities,
        dateRange: filters.dateRange ? {
          start: new Date(filters.dateRange.start),
          end: new Date(filters.dateRange.end)
        } : undefined
      };
    }

    const results = await SearchService.semanticSearch(
      query,
      limit,
      threshold,
      parsedFilters
    );

    res.json({
      query,
      results,
      totalResults: results.length
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * POST /api/research/chat
 * Conversational RAG - ask questions about your knowledge
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { query, conversationId, maxContext = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const response = await ragService.chat(query, conversationId, maxContext);

    res.json(response);
  } catch (error) {
    console.error('RAG chat error:', error);
    res.status(500).json({ error: 'Chat failed' });
  }
});

/**
 * GET /api/research/conversations
 * List all conversations
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [conversations, total] = await prisma.$transaction([
      prisma.conversation.findMany({
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'asc' }
          }
        }
      }),
      prisma.conversation.count()
    ]);

    res.json({
      data: conversations.map(c => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        firstMessage: c.messages[0]?.content
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * GET /api/research/conversations/:id
 * Get conversation with all messages
 */
router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * DELETE /api/research/conversations/:id
 * Delete a conversation
 */
router.delete('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.conversation.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * GET /api/research/actions
 * Search for pending actions (TODOs, REMINDERs)
 */
router.get('/actions', async (req: Request, res: Response) => {
  try {
    const type = (req.query.type as string) || 'TODO';
    const limit = parseInt(req.query.limit as string) || 20;

    if (!['TODO', 'REMINDER', 'FOLLOW_UP'].includes(type)) {
      return res.status(400).json({ error: 'Invalid action type' });
    }

    const results = await SearchService.searchActions(type as any, limit);

    res.json({
      type,
      results,
      totalResults: results.length
    });
  } catch (error) {
    console.error('Search actions error:', error);
    res.status(500).json({ error: 'Failed to search actions' });
  }
});

export default router;
