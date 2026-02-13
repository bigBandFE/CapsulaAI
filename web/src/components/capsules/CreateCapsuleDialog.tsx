import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Upload, Globe, FileText, Image as ImageIcon, X, File } from "lucide-react";
import { capsuleService } from "@/services/capsule";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Schema for text note
const noteSchema = z.object({
  originalContent: z.string().min(1, "Content is required"),
});

// Schema for URL
const urlSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
  tags: z.string().optional(),
});

export function CreateCapsuleDialog() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("note");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const queryClient = useQueryClient();

  const noteForm = useForm<z.infer<typeof noteSchema>>({
    resolver: zodResolver(noteSchema),
    defaultValues: { originalContent: "" },
  });

  const urlForm = useForm<z.infer<typeof urlSchema>>({
    resolver: zodResolver(urlSchema),
    defaultValues: { url: "", tags: "" },
  });

  // Note creation
  const noteMutation = useMutation({
    mutationFn: (values: z.infer<typeof noteSchema>) =>
      capsuleService.create({ originalContent: values.originalContent, sourceType: "NOTE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["capsules"] });
      resetAndClose();
    },
  });

  // URL ingestion
  const urlMutation = useMutation({
    mutationFn: (values: z.infer<typeof urlSchema>) => {
      const tags = values.tags ? values.tags.split(",").map(t => t.trim()).filter(Boolean) : undefined;
      return capsuleService.ingestUrl(values.url, tags);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["capsules"] });
      resetAndClose();
    },
  });

  // File upload → Capsule creation
  const fileMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadProgress("Uploading file...");
      const uploadResult = await capsuleService.uploadFile(file);

      setUploadProgress("Creating capsule...");
      const sourceType = file.type.startsWith("image/") ? "IMAGE" : "PDF";
      return capsuleService.createWithAssets({
        originalContent: `Uploaded: ${file.name}`,
        sourceType,
        assets: [{
          storagePath: uploadResult.objectName,
          mimeType: uploadResult.mimeType,
          size: uploadResult.size,
          fileName: uploadResult.originalName,
        }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["capsules"] });
      resetAndClose();
    },
    onSettled: () => setUploadProgress(""),
  });

  const resetAndClose = () => {
    setOpen(false);
    setSelectedFile(null);
    setUploadProgress("");
    setActiveTab("note");
    noteForm.reset();
    urlForm.reset();
  };

  // Drag & drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const isPending = noteMutation.isPending || urlMutation.isPending || fileMutation.isPending;

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return <ImageIcon className="h-8 w-8 text-blue-500" />;
    if (file.type === "application/pdf") return <File className="h-8 w-8 text-red-500" />;
    return <FileText className="h-8 w-8 text-muted-foreground" />;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New Capsule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Capsule</DialogTitle>
          <DialogDescription>
            Add a new memory capsule from text, URL, or file upload.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="note" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Note
            </TabsTrigger>
            <TabsTrigger value="url" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> URL
            </TabsTrigger>
            <TabsTrigger value="file" className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" /> File
            </TabsTrigger>
          </TabsList>

          {/* Note Tab */}
          <TabsContent value="note">
            <Form {...noteForm}>
              <form onSubmit={noteForm.handleSubmit((v) => noteMutation.mutate(v))} className="space-y-4">
                <FormField
                  control={noteForm.control}
                  name="originalContent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Paste or type your notes, meeting minutes, ideas..."
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={isPending}>
                    {noteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Note
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          {/* URL Tab */}
          <TabsContent value="url">
            <Form {...urlForm}>
              <form onSubmit={urlForm.handleSubmit((v) => urlMutation.mutate(v))} className="space-y-4">
                <FormField
                  control={urlForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com/article" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={urlForm.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="tech, ai, research (comma separated)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={isPending}>
                    {urlMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crawl & Save
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          {/* File Upload Tab */}
          <TabsContent value="file">
            <div className="space-y-4">
              {!selectedFile ? (
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                    dragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  )}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("file-input")?.click()}
                >
                  <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports: Images (PNG, JPG, WEBP) and PDFs
                  </p>
                  <input
                    id="file-input"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              ) : (
                <div className="border rounded-lg p-4 flex items-center gap-3">
                  {getFileIcon(selectedFile)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)} className="shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {uploadProgress && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadProgress}
                </div>
              )}

              <DialogFooter>
                <Button
                  disabled={!selectedFile || isPending}
                  onClick={() => selectedFile && fileMutation.mutate(selectedFile)}
                >
                  {fileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload & Process
                </Button>
              </DialogFooter>
            </div>
          </TabsContent>
        </Tabs>

        {(noteMutation.isError || urlMutation.isError || fileMutation.isError) && (
          <p className="text-sm text-destructive mt-2">
            Something went wrong. Please try again.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
