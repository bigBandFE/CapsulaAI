import { api } from '@/lib/api';

export interface Capsule {
  id: string;
  sourceType: 'NOTE' | 'IMAGE' | 'PDF' | 'WEBSITE' | 'AUDIO';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  originalContent?: string;
  structuredData?: any;
  isSanitized: boolean;
  qualityScore?: number;
  feedbackCount?: number;
  assets?: Array<{
    id: string;
    storagePath: string;
    mimeType: string;
    size: number;
    fileName?: string;
  }>;
}

export interface UploadResponse {
  message: string;
  url: string;
  objectName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export const capsuleService = {
  getAll: async (page = 1, limit = 20) => {
    const response = await api.get<{ data: Capsule[]; meta: any }>(`/capsules?page=${page}&limit=${limit}`);
    return response.data.data;
  },

  getById: async (id: string) => {
    const response = await api.get<Capsule>(`/capsules/${id}`);
    return response.data;
  },

  create: async (data: { originalContent: string; sourceType: string }) => {
    const response = await api.post<Capsule>('/capsules', data);
    return response.data;
  },

  createWithAssets: async (data: {
    originalContent?: string;
    sourceType: string;
    assets?: Array<{ storagePath: string; mimeType: string; size: number; fileName: string }>;
  }) => {
    const response = await api.post<Capsule>('/capsules', data);
    return response.data;
  },

  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<UploadResponse>('/uploads/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  ingestUrl: async (url: string, tags?: string[]) => {
    const response = await api.post<Capsule>('/ingest/url', { url, tags });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/capsules/${id}`);
  },

  retry: async (id: string) => {
    const response = await api.post<Capsule>(`/capsules/${id}/retry`);
    return response.data;
  },

  reprocess: async (id: string) => {
    const response = await api.post<Capsule>(`/capsules/${id}/reprocess`);
    return response.data;
  },
};
