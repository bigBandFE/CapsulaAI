import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Upload, FileText, Image as ImageIcon, X, File as FileIcon } from "lucide-react";
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
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Unified Schema for Multi-Modal Note
const capsuleSchema = z.object({
  originalContent: z.string().optional(),
});

export function CreateCapsuleDialog() {
  const [open, setOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof capsuleSchema>>({
    resolver: zodResolver(capsuleSchema),
    defaultValues: { originalContent: "" },
  });

  // Unified creation mutation
  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof capsuleSchema>) => {
      const content = values.originalContent?.trim();
      const hasFiles = selectedFiles.length > 0;

      if (!content && !hasFiles) {
        throw new Error("Please provide either text content or at least one file attachment.");
      }

      setUploadProgress("Processing...");

      // 1. Upload all files if any exist
      let assets: any[] = [];
      if (hasFiles) {
        setUploadProgress(`Uploading ${selectedFiles.length} file(s)...`);
        const uploadPromises = selectedFiles.map((file) => capsuleService.uploadFile(file));
        const uploadResults = await Promise.all(uploadPromises);

        assets = uploadResults.map((res) => ({
          storagePath: res.objectName,
          mimeType: res.mimeType,
          size: res.size,
          fileName: res.originalName,
        }));
      }

      // 2. Determine primary source type
      let sourceType = "NOTE";
      if (!content && hasFiles) {
        const firstFile = selectedFiles[0];
        sourceType = firstFile.type.startsWith("image/") ? "IMAGE" : "PDF";
      }

      setUploadProgress("Creating Capsule...");
      return capsuleService.createWithAssets({
        originalContent: content || `[Uploaded ${selectedFiles.length} file(s)]`,
        sourceType,
        assets: assets.length > 0 ? assets : undefined,
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
    setSelectedFiles([]);
    setUploadProgress("");
    form.reset();
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
    if (e.dataTransfer.files?.length) {
      const newFiles = Array.from(e.dataTransfer.files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
    // Reset file input so same file can be selected again if removed
    e.target.value = '';
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const isPending = createMutation.isPending;

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return <ImageIcon className="h-6 w-6 text-blue-500" />;
    if (file.type === "application/pdf") return <FileIcon className="h-6 w-6 text-red-500" />;
    return <FileText className="h-6 w-6 text-muted-foreground" />;
  };

  // Prevent submission if form is completely empty
  const isFormEmpty = !form.watch("originalContent")?.trim() && selectedFiles.length === 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isPending && setOpen(isOpen)}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New Capsule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Rich Capsule</DialogTitle>
          <DialogDescription>
            Type notes, paste URLs, or drop images/PDFs. The AI will weave everything together.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="originalContent"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="Type your notes, paste links, or write meeting minutes here..."
                      className="min-h-[150px] resize-y text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Attachments UI */}
            <div className="space-y-3">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Attachments
              </label>

              {/* File List */}
              {selectedFiles.length > 0 && (
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-2">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 border rounded p-2 bg-muted/20">
                      {getFileIcon(file)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{file.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeFile(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Dropzone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("multi-file-input")?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Add more files</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Drag & drop multiple Images or PDFs
                </p>
                <input
                  id="multi-file-input"
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            </div>

            {uploadProgress && (
              <div className="flex items-center gap-2 text-sm font-medium text-blue-600 bg-blue-50 p-3 rounded-md">
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadProgress}
              </div>
            )}

            {createMutation.isError && (
              <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
                {createMutation.error instanceof Error ? createMutation.error.message : "Failed to create capsule. Please try again."}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={resetAndClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || isFormEmpty}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create & Analyze
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
