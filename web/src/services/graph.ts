import { api } from '@/lib/api';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  connectionCount: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const graphService = {
  getStats: async () => {
    const response = await api.get('/graph/stats');
    return response.data;
  },

  getVisualization: async (entityId?: string, depth?: number) => {
    const params = new URLSearchParams();
    if (entityId) params.append('entityId', entityId);
    if (depth) params.append('depth', depth.toString());

    const response = await api.get<GraphData>(`/graph/visualization?${params.toString()}`);
    return response.data;
  },

  findPath: async (from: string, to: string) => {
    const response = await api.get(`/graph/path?from=${from}&to=${to}`);
    return response.data;
  }
};
