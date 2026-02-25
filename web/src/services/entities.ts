import { api } from '@/lib/api';

export interface EntityInfo {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  capsuleCount: number;
  recentCapsules: any[];
}

export interface EntityTimeline {
  entity: {
    name: string;
    type: string;
    firstMention: string;
    lastMention: string;
    totalMentions: number;
  };
  timeline: Array<{
    date: string;
    capsules: Array<{
      id: string;
      createdAt: string;
      title: string;
      summary: string;
      context: string;
    }>;
  }>;
}

export const entityService = {
  getEntity: async (name: string, type: string) => {
    const response = await api.get<EntityInfo>(`/entities/${encodeURIComponent(name)}?type=${type}`);
    return response.data;
  },

  getTimeline: async (name: string, type: string) => {
    const response = await api.get<EntityTimeline>(`/entities/${encodeURIComponent(name)}/timeline?type=${type}`);
    return response.data;
  },

  getRelationships: async (id: string, direction?: 'from' | 'to' | 'both') => {
    const params = direction ? `?direction=${direction}` : '';
    const response = await api.get<any[]>(`/entities/${id}/relationships${params}`);
    return response.data;
  }
};
