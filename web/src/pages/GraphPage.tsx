import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { graphService } from "@/services/graph";
import { GraphView } from "@/components/graph/GraphView";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function GraphPage() {
  const { data: graphData, isLoading, error } = useQuery({
    queryKey: ["graph-visualization"],
    queryFn: () => graphService.getVisualization(),
  });

  const { data: stats } = useQuery({
    queryKey: ["graph-stats"],
    queryFn: graphService.getStats,
  });

  if (isLoading) {
    return (
      <div className="flex bg-background h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-destructive space-y-4">
        <AlertCircle className="h-8 w-8" />
        <p>Failed to load knowledge graph</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Knowledge Graph</h2>
          <p className="text-muted-foreground">Explore connections between your entities.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Relationships</CardDescription>
            <CardTitle className="text-2xl">{stats?.totalRelationships || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Top Entity</CardDescription>
            <CardTitle className="text-lg truncate">
              {stats?.topConnectedEntities?.[0]?.name || "N/A"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Relationship Types</CardDescription>
            <CardTitle className="text-lg">
              {Object.keys(stats?.byType || {}).length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex-1 min-h-[500px]">
        {graphData && graphData.nodes.length > 0 ? (
          <GraphView data={graphData} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full border border-dashed rounded-lg bg-muted/20">
            <p className="text-muted-foreground">No relationships found. Add capsules to generate the graph.</p>
          </div>
        )}
      </div>
    </div>
  );
}
