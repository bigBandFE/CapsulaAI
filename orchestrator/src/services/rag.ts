import { PrismaClient } from '@prisma/client';
import { SearchService, SearchResult } from './search';
import { ModelAdapter, LLMConfig } from '../ai';

const prisma = new PrismaClient();

export interface RAGResponse {
  conversationId: string;
  query: string;
  answer: string;
  sources: Array<{
    capsuleId: string;
    title: string;
    relevance: number;
  }>;
  timestamp: Date;
}

export class RAGService {
  private modelAdapter: ModelAdapter;

  constructor(config: LLMConfig) {
    this.modelAdapter = new ModelAdapter(config);
  }

  /**
   * Generate answer using RAG (Retrieval-Augmented Generation)
   */
  async chat(
    query: string,
    conversationId?: string,
    maxContext: number = 5
  ): Promise<RAGResponse> {
    // 1. Retrieve relevant capsules
    const searchResults = await SearchService.semanticSearch(query, maxContext, 0.6);

    if (searchResults.length === 0) {
      return this.generateNoResultsResponse(query, conversationId);
    }

    // 2. Build context from search results
    const context = this.buildContext(searchResults);

    // 3. Get conversation history if continuing
    let conversationHistory: Array<{ role: string; content: string }> = [];
    let conversation: any = null;

    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 10 // Last 10 messages for context
          }
        }
      });

      if (conversation) {
        conversationHistory = conversation.messages.map((m: any) => ({
          role: m.role,
          content: m.content
        }));
      }
    }

    // 4. Create new conversation if needed
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          title: query.substring(0, 100) // Use first query as title
        }
      });
      conversationId = conversation.id;
    }

    // 5. Build RAG prompt
    const ragPrompt = this.buildRAGPrompt(query, context, conversationHistory);

    // 6. Generate answer
    const response = await this.modelAdapter.chatCompletion([
      { role: 'user', content: ragPrompt }
    ], false);

    const answer = response.content;

    // 7. Save messages to conversation
    await prisma.message.createMany({
      data: [
        {
          conversationId: conversationId!,
          role: 'user',
          content: query
        },
        {
          conversationId: conversationId!,
          role: 'assistant',
          content: answer,
          sources: searchResults.map(r => ({
            capsuleId: r.capsule.id,
            title: r.capsule.title,
            relevance: r.score
          }))
        }
      ]
    });

    // 8. Return response
    return {
      conversationId: conversationId!,
      query,
      answer,
      sources: searchResults.map(r => ({
        capsuleId: r.capsule.id,
        title: r.capsule.title,
        relevance: r.score
      })),
      timestamp: new Date()
    };
  }

  /**
   * Build context string from search results
   */
  private buildContext(results: SearchResult[]): string {
    return results.map((r, i) => {
      const title = r.capsule.title;
      const date = r.capsule.createdAt.toISOString().split('T')[0];
      const content = r.capsule.summary || r.relevantChunk;

      return `[Capsule ${i + 1}] ${title} (${date})\n${content}`;
    }).join('\n\n---\n\n');
  }

  /**
   * Build RAG prompt with context and conversation history
   */
  private buildRAGPrompt(
    query: string,
    context: string,
    history: Array<{ role: string; content: string }>
  ): string {
    let prompt = `You are a helpful research assistant with access to the user's personal knowledge base.

Your task is to answer the user's question based ONLY on the provided context from their knowledge capsules.

IMPORTANT RULES:
1. Only use information from the provided context
2. If the context doesn't contain relevant information, say "I don't have information about that in your knowledge base"
3. Be concise and direct
4. Cite which capsule(s) you're referencing (e.g., "According to Capsule 1...")
5. If asked about multiple topics, organize your answer clearly

`;

    // Add conversation history if exists
    if (history.length > 0) {
      prompt += `\nPREVIOUS CONVERSATION:\n`;
      history.forEach(msg => {
        prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    // Add context
    prompt += `KNOWLEDGE CONTEXT:\n${context}\n\n`;

    // Add current query
    prompt += `USER QUESTION: ${query}\n\n`;
    prompt += `ANSWER:`;

    return prompt;
  }

  /**
   * Generate response when no results found
   */
  private async generateNoResultsResponse(
    query: string,
    conversationId?: string
  ): Promise<RAGResponse> {
    const answer = "I don't have any information about that in your knowledge base. Try rephrasing your question or check if you've captured relevant content.";

    // Create conversation if needed
    if (!conversationId) {
      const conversation = await prisma.conversation.create({
        data: { title: query.substring(0, 100) }
      });
      conversationId = conversation.id;
    }

    // Save messages
    await prisma.message.createMany({
      data: [
        {
          conversationId,
          role: 'user',
          content: query
        },
        {
          conversationId,
          role: 'assistant',
          content: answer,
          sources: null
        }
      ]
    });

    return {
      conversationId,
      query,
      answer,
      sources: [],
      timestamp: new Date()
    };
  }
}
