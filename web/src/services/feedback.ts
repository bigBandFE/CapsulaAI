import { api } from '@/lib/api';

export interface FeedbackAnalytics {
  totalFeedback: number;
  byType: Record<string, number>;
  averageRating: number;
  topIssues: any[];
  qualityTrend: any[];
}

export interface CorrectionPattern {
  count: number;
  field: string;
  example: any;
}

export const feedbackService = {
  getAnalytics: async () => {
    const response = await api.get<FeedbackAnalytics>('/feedback/analytics');
    return response.data;
  },

  getPatterns: async () => {
    const response = await api.get<{ patterns: CorrectionPattern[]; totalCorrections: number }>('/feedback/patterns');
    return response.data;
  }
};
