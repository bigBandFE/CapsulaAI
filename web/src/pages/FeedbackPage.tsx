import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, AlertTriangle, CheckCircle, Flag } from "lucide-react";
import { feedbackService } from "@/services/feedback";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function FeedbackPage() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["feedback-analytics"],
    queryFn: feedbackService.getAnalytics,
  });

  const { data: patterns } = useQuery({
    queryKey: ["feedback-patterns"],
    queryFn: feedbackService.getPatterns,
  });

  if (isLoading) {
    return (
      <div className="flex bg-background h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Quality & Feedback</h2>
        <p className="text-muted-foreground">Monitor system performance and self-improvement metrics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.averageRating?.toFixed(1) || "N/A"}</div>
            <p className="text-xs text-muted-foreground">
              Based on {analytics?.totalFeedback || 0} feedback items
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Corrections</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.byType?.CORRECTION || 0}</div>
            <p className="text-xs text-muted-foreground">
              Manual fixes applied
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flags</CardTitle>
            <Flag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.byType?.FLAG || 0}</div>
            <p className="text-xs text-muted-foreground">
              Issues reported
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Common Correction Patterns</CardTitle>
            <CardDescription>
              Fields that frequently require manual correction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {patterns?.patterns?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No patterns detected yet.</p>
              ) : (
                patterns?.patterns?.map((pattern, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{pattern.field}</span>
                      <span className="text-muted-foreground">{pattern.count} times</span>
                    </div>
                    <Progress value={(pattern.count / (patterns.totalCorrections || 1)) * 100} />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
