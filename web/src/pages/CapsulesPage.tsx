import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { FileText, Globe, Image as ImageIcon, File, Loader2, AlertCircle } from "lucide-react";
import { capsuleService, type Capsule } from "@/services/capsule";
import { CreateCapsuleDialog } from "@/components/capsules/CreateCapsuleDialog";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

const sourceTypeIcons = {
  NOTE: FileText,
  WEBSITE: Globe,
  IMAGE: ImageIcon,
  PDF: File,
};

function CapsuleCard({ capsule }: { capsule: Capsule }) {
  const navigate = useNavigate();
  const Icon = sourceTypeIcons[capsule.sourceType as keyof typeof sourceTypeIcons] || FileText;

  return (
    <Card className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => navigate(`/capsules/${capsule.id}`)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium truncate max-w-[200px]">
          {capsule.summary || capsule.structuredData?.meta?.title || "Untitled Capsule"}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {capsule.rawContent || capsule.originalContent}
      </CardContent>
      <CardFooter className="flex justify-between items-center pt-2">
        <Badge variant={
          capsule.status === 'COMPLETED' ? 'default' :
            capsule.status === 'PROCESSING' ? 'secondary' :
              capsule.status === 'FAILED' ? 'destructive' : 'outline'
        } className="text-[10px] px-1 py-0 h-5">
          {capsule.status}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {format(new Date(capsule.createdAt), "MMM d, HH:mm")}
        </span>
      </CardFooter>
    </Card>
  );
}

export default function CapsulesPage() {
  const { data: capsules, isLoading, error } = useQuery({
    queryKey: ["capsules"],
    queryFn: () => capsuleService.getAll(),
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
        <p>Failed to load capsules</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Capsules</h2>
          <p className="text-muted-foreground">Manage your knowledge capsules here.</p>
        </div>
        <CreateCapsuleDialog />
      </div>

      {capsules?.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">No capsules found.</p>
          <CreateCapsuleDialog />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {capsules?.map((capsule) => (
            <CapsuleCard key={capsule.id} capsule={capsule} />
          ))}
        </div>
      )}
    </div>
  );
}
