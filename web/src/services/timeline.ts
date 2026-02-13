import { api } from '@/lib/api';
import { type Capsule } from './capsule';

export interface TimelineStats {
  totalCapsules: number;
  bySourceType: Record<string, number>;
  topEntities: Array<{ name: string; type: string; count: number }>;
}

export interface DayStats {
  date: string;
  count: number;
}

export interface HeatmapData {
  year: number;
  data: DayStats[];
  stats: {
    totalDays: number;
    activeDays: number;
    averagePerDay: string;
    maxInDay: number;
    maxDate: string;
  };
}

export const timelineService = {
  getHeatmap: async (year?: number) => {
    const params = year ? `?year=${year}` : '';
    const response = await api.get<HeatmapData>(`/timeline/heatmap${params}`);
    return response.data;
  },

  getDaily: async (date: string) => {
    const response = await api.get<{ date: string; count: number; capsules: any[] }>(`/timeline/daily?date=${date}`);
    return response.data;
  }
};
