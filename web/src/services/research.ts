import { api } from '@/lib/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
  firstMessage?: string;
}

export interface ChatResponse {
  conversationId: string;
  response: string;
  sources: any[];
}

export const researchService = {
  chat: async (query: string, conversationId?: string) => {
    const response = await api.post<ChatResponse>('/research/chat', {
      query,
      conversationId
    });
    return response.data;
  },

  getConversations: async (page = 1, limit = 20) => {
    const response = await api.get<{ data: Conversation[], meta: any }>(`/research/conversations?page=${page}&limit=${limit}`);
    return response.data;
  },

  getConversation: async (id: string) => {
    const response = await api.get<Conversation>(`/research/conversations/${id}`);
    return response.data;
  },

  deleteConversation: async (id: string) => {
    await api.delete(`/research/conversations/${id}`);
  }
};
