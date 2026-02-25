import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowLeft, Network, Clock, FileText } from 'lucide-react';
import { entityService } from '@/services/entities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function EntityDetailPage() {
  const { type, name } = useParams();
  const navigate = useNavigate();

  const { data: entity, isLoading } = useQuery({
    queryKey: ['entity', type, name],
    queryFn: () => entityService.getEntity(name!, type!)
  });

  const { data: timeline } = useQuery({
    queryKey: ['entity-timeline', type, name],
    queryFn: () => entityService.getTimeline(name!, type!),
    enabled: !!entity
  });

  const { data: relationships } = useQuery({
    queryKey: ['entity-relationships', entity?.id],
    queryFn: () => entityService.getRelationships(entity!.id, 'both'),
    enabled: !!entity?.id
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center bg-background"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  if (!entity) {
    return <div className="p-8">Entity not found</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{entity.name}</h1>
            <Badge variant="secondary">{entity.type}</Badge>
          </div>
          <div className="text-muted-foreground mt-1">
            First seen {format(parseISO(entity.createdAt), 'PP')} &bull; Mentions in {entity.capsuleCount} capsules
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview"><FileText className="w-4 h-4 mr-2" /> Overview</TabsTrigger>
          <TabsTrigger value="timeline"><Clock className="w-4 h-4 mr-2" /> Timeline</TabsTrigger>
          <TabsTrigger value="relationships"><Network className="w-4 h-4 mr-2" /> Relationships</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Recent Capsules</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {entity.recentCapsules?.map(cap => (
                <div key={cap.id} className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(`/capsules/${cap.id}`)}>
                  <h3 className="font-semibold">{cap.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{format(parseISO(cap.createdAt), 'PPp')}</p>
                </div>
              ))}
              {(!entity.recentCapsules || entity.recentCapsules.length === 0) && (
                <p className="text-muted-foreground">No recent capsules.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle>Mention Timeline</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {timeline?.timeline.map((day) => (
                  <div key={day.date} className="relative flex items-start justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm relative z-10">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-lg border bg-card shadow-sm space-y-3">
                      <div className="font-bold text-lg mb-2">{format(parseISO(day.date), 'PPPP')}</div>
                      {day.capsules.map(cap => (
                        <div key={cap.id} className="p-3 bg-muted/30 rounded-md border text-sm cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/capsules/${cap.id}`)}>
                          <div className="font-medium text-primary mb-1">{cap.title}</div>
                          <p className="text-muted-foreground line-clamp-2 italic">"{cap.context}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relationships">
          <Card>
            <CardHeader><CardTitle>Known Relationships</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {relationships?.map(rel => (
                  <div key={rel.id} className="flex flex-col gap-2 p-4 border rounded-lg bg-card shadow-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{rel.type}</Badge>
                      <span className="text-xs text-muted-foreground">Score: {rel.strength?.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="font-medium text-muted-foreground">{rel.direction === 'from' ? 'To' : 'From'}</span>
                      <Button variant="link" className="p-0 h-auto font-semibold" onClick={() => navigate(`/entities/${rel.relatedEntity.type}/${encodeURIComponent(rel.relatedEntity.name)}`)}>
                        {rel.relatedEntity.name}
                      </Button>
                      <Badge variant="secondary" className="text-[10px]">{rel.relatedEntity.type}</Badge>
                    </div>
                    {rel.source && (
                      <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
                        Source: <span className="italic cursor-pointer hover:underline" onClick={() => navigate(`/capsules/${rel.source.capsuleId}`)}>{rel.source.title}</span>
                      </div>
                    )}
                  </div>
                ))}
                {(!relationships || relationships.length === 0) && (
                  <p className="text-muted-foreground">No known relationships.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
