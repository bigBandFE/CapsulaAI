import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader2, Bot, User, Trash2, MessageSquare, Plus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { researchService, type Conversation, type Message } from '@/services/research';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from "date-fns";

export default function ResearchPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch conversations list
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => researchService.getConversations(),
  });

  // Fetch active conversation details
  const { data: activeConversation, isLoading: isLoadingConversation } = useQuery({
    queryKey: ['conversation', activeId],
    queryFn: () => researchService.getConversation(activeId!),
    enabled: !!activeId,
  });

  // Derived state for messages (optimistic updates could be added here)
  const messages = activeConversation?.messages || [];

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (query: string) => {
      return await researchService.chat(query, activeId || undefined);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (activeId) {
        queryClient.invalidateQueries({ queryKey: ['conversation', activeId] });
      } else {
        setActiveId(data.conversationId);
      }
      setInput('');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: researchService.deleteConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (activeId) setActiveId(null);
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;
    chatMutation.mutate(input);
  };

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar: Conversation List */}
      <Card className="w-80 flex flex-col h-full border-r bg-muted/20">
        <div className="p-4 border-b">
          <Button className="w-full justify-start" onClick={() => setActiveId(null)}>
            <Plus className="mr-2 h-4 w-4" /> New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-2">
            {conversationsData?.data.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center justify-between p-2 rounded-md hover:bg-accent cursor-pointer text-sm",
                  activeId === conv.id && "bg-accent"
                )}
                onClick={() => setActiveId(conv.id)}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{conv.title || "Untitled Chat"}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(conv.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Main: Chat Interface */}
      <Card className="flex-1 flex flex-col h-full overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-6 max-w-3xl mx-auto">
            {messages.length === 0 && !chatMutation.isPending && (
              <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                <Bot className="h-12 w-12 mb-4 opacity-20" />
                <p>Start a new research session</p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-4", msg.role === 'user' ? "justify-end" : "justify-start")}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "rounded-lg px-4 py-2 max-w-[80%]",
                  msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  <div className="prose dark:prose-invert text-sm break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                  <span className="text-[10px] opacity-50 mt-1 block">
                    {format(new Date(msg.createdAt), "HH:mm")}
                  </span>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                    <User className="h-5 w-5" />
                  </div>
                )}
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex gap-4 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-2 flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-background">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your knowledge base..."
              className="flex-1"
            />
            <Button type="submit" disabled={chatMutation.isPending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
