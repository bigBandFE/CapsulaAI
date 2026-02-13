import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, getDay, startOfYear, eachDayOfInterval, endOfYear } from "date-fns";
import { Loader2, Calendar as CalendarIcon, FileText } from "lucide-react";
import { timelineService } from "@/services/timeline";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function TimelinePage() {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const currentYear = new Date().getFullYear();

  const { data: heatmapData, isLoading: isHeatmapLoading } = useQuery({
    queryKey: ["timeline-heatmap", currentYear],
    queryFn: () => timelineService.getHeatmap(currentYear),
  });

  const { data: dailyData, isLoading: isDailyLoading } = useQuery({
    queryKey: ["timeline-daily", selectedDate],
    queryFn: () => timelineService.getDaily(selectedDate),
    enabled: !!selectedDate,
  });

  const getColor = (count: number, max: number) => {
    if (count === 0) return "bg-muted";
    // Simple 4-level scale based on relative intensity
    const intensity = Math.ceil((count / Math.max(max, 1)) * 4);
    switch (intensity) {
      case 1: return "bg-primary/30";
      case 2: return "bg-primary/50";
      case 3: return "bg-primary/70";
      case 4: return "bg-primary";
      default: return "bg-primary";
    }
  };

  if (isHeatmapLoading) {
    return (
      <div className="flex bg-background h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Generate grid for the year (simplistic approach: just map the data returns from API)
  // The API returns 365/366 days.
  // We want to render them in a grid: 7 rows (days of week) x 52 columns (weeks).

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Timeline</h2>
        <p className="text-muted-foreground">Visualize your memory creation over time.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5 h-full">
        {/* Heatmap Section */}
        <Card className="md:col-span-3 lg:col-span-4 flex flex-col">
          <CardHeader>
            <CardTitle>{currentYear} Activity</CardTitle>
            <CardDescription>
              {heatmapData?.stats.activeDays} active days • {heatmapData?.stats.maxInDay} max capsules/day
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div className="flex flex-wrap gap-1 p-2 min-w-[800px]">
              {heatmapData?.data.map((day) => (
                <div
                  key={day.date}
                  className={cn(
                    "w-3 h-3 rounded-[2px] cursor-pointer hover:ring-2 hover:ring-ring transition-all",
                    getColor(day.count, heatmapData.stats.maxInDay),
                    selectedDate === day.date && "ring-2 ring-primary border-primary"
                  )}
                  title={`${day.date}: ${day.count} capsules`}
                  onClick={() => setSelectedDate(day.date)}
                />
              ))}
            </div>
            <div className="mt-4 text-xs text-muted-foreground flex items-center justify-end gap-2">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-[2px] bg-muted" />
                <div className="w-3 h-3 rounded-[2px] bg-primary/30" />
                <div className="w-3 h-3 rounded-[2px] bg-primary/50" />
                <div className="w-3 h-3 rounded-[2px] bg-primary/70" />
                <div className="w-3 h-3 rounded-[2px] bg-primary" />
              </div>
              <span>More</span>
            </div>
          </CardContent>
        </Card>

        {/* Selected Day Details */}
        <Card className="flex flex-col h-full border-l md:col-span-1 border-t-0 border-r-0 border-b-0 rounded-none shadow-none bg-muted/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate}
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1 p-4 pt-0">
            {isDailyLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : dailyData?.capsules && dailyData.capsules.length > 0 ? (
              <div className="space-y-3">
                {dailyData.capsules.map((capsule: any) => (
                  <div key={capsule.id} className="p-3 bg-card rounded-md border shadow-sm">
                    <div className="font-medium text-sm truncate mb-1">{capsule.title}</div>
                    <div className="flex flex-wrap gap-1">
                      {capsule.entities.map((e: any, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px] px-1 h-4">
                          {e.name}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-2 text-right">
                      {format(parseISO(capsule.createdAt), "HH:mm")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground text-sm py-8">
                No activity on this day.
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
