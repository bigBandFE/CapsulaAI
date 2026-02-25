import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Globe, Loader2, Send, FileText, Image as ImageIcon, File,
  Upload, Clock, CheckCircle, AlertCircle, RefreshCw
} from "lucide-react";
import { capsuleService, type Capsule } from "@/services/capsule";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CreateCapsuleDialog } from "@/components/capsules/CreateCapsuleDialog";

const statusConfig = {
  PENDING: { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-50", label: "Pending" },
  PROCESSING: { icon: RefreshCw, color: "text-blue-500", bg: "bg-blue-50", label: "Processing" },
  COMPLETED: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-50", label: "Completed" },
  FAILED: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50", label: "Failed" },
  ARCHIVED: { icon: FileText, color: "text-gray-500", bg: "bg-gray-50", label: "Archived" },
};

const sourceIcons: Record<string, any> = {
  NOTE: FileText,
  WEBSITE: Globe,
  IMAGE: ImageIcon,
  PDF: File,
};

export default function InboxPage() {
  const [urlInput, setUrlInput] = useState("");
  const queryClient = useQueryClient();

  // Fetch all capsules (including pending/processing)
  const { data: capsules, isLoading } = useQuery({
    queryKey: ["capsules"],
    queryFn: () => capsuleService.getAll(1, 50),
    refetchInterval: 5000, // Auto-refresh every 5s to check processing status
  });

  // URL ingestion
  const ingestMutation = useMutation({
    mutationFn: (url: string) => capsuleService.ingestUrl(url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["capsules"] });
      setUrlInput("");
    },
  });

  const handleIngestUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || ingestMutation.isPending) return;
    ingestMutation.mutate(urlInput);
  };

  // Separate capsules by status
  const pendingCapsules = capsules?.filter(c => c.status === "PENDING" || c.status === "PROCESSING") || [];
  const recentCapsules = capsules?.filter(c => c.status === "COMPLETED").slice(0, 10) || [];
  const failedCapsules = capsules?.filter(c => c.status === "FAILED") || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inbox</h2>
          <p className="text-muted-foreground">Quick capture from any source — URLs, files, or text.</p>
        </div>
        <CreateCapsuleDialog />
      </div>

      {/* Quick URL Capture */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" /> Quick URL Capture
          </CardTitle>
          <CardDescription>
            Paste a URL to automatically crawl and extract knowledge.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleIngestUrl} className="flex gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/article-to-save"
              className="flex-1"
            />
            <Button type="submit" disabled={ingestMutation.isPending || !urlInput.trim()}>
              {ingestMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          {ingestMutation.isError && (
            <p className="text-sm text-destructive mt-2">Failed to crawl URL. Please check and try again.</p>
          )}
          {ingestMutation.isSuccess && (
            <p className="text-sm text-green-600 mt-2">✓ URL captured! Processing...</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Processing Queue */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" /> Processing Queue
              </span>
              {pendingCapsules.length > 0 && (
                <Badge variant="secondary">{pendingCapsules.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : pendingCapsules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No items pending
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {pendingCapsules.map((capsule) => (
                    <CapsuleRow key={capsule.id} capsule={capsule} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Failed Items */}
        {failedCapsules.length > 0 && (
          <Card className="flex flex-col border-destructive/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" /> Failed
                </span>
                <Badge variant="destructive">{failedCapsules.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {failedCapsules.map((capsule) => (
                    <CapsuleRow key={capsule.id} capsule={capsule} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Recent Completed */}
        <Card className={cn("flex flex-col", failedCapsules.length === 0 && "md:col-span-1")}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5" /> Recently Processed
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {recentCapsules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No capsules yet. Start capturing!
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {recentCapsules.map((capsule) => (
                    <CapsuleRow key={capsule.id} capsule={capsule} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CapsuleRow({ capsule }: { capsule: Capsule }) {
  const status = statusConfig[capsule.status] || statusConfig.PENDING;
  const StatusIcon = status.icon;
  const primarySource = capsule.sourceTypes?.[0] || capsule.sourceType || "NOTE";
  const SourceIcon = sourceIcons[primarySource] || FileText;
  const title = capsule.summary || capsule.structuredData?.meta?.title || capsule.rawContent?.slice(0, 60) || capsule.originalContent?.slice(0, 60) || "Untitled";

  return (
    <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 transition-colors">
      <div className={cn("p-1.5 rounded", status.bg)}>
        <StatusIcon className={cn("h-4 w-4", status.color, capsule.status === "PROCESSING" && "animate-spin")} />
      </div>
      <SourceIcon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-[10px] text-muted-foreground">
          {primarySource} • {format(new Date(capsule.createdAt), "MMM d, HH:mm")}
        </p>
      </div>
    </div>
  );
}
