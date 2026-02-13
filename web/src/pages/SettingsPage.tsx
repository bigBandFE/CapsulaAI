import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Settings, Save, Server, Cloud, Eye, Loader2, CheckCircle, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ModelConfig {
  endpoint: string;
  modelName: string;
  apiKey: string;
}

interface ModelSettings {
  local: ModelConfig;
  cloud: ModelConfig;
  vision: ModelConfig;
}

function ModelSection({
  title,
  icon: Icon,
  config,
  onChange,
  color,
}: {
  title: string;
  icon: typeof Server;
  config: ModelConfig;
  onChange: (field: keyof ModelConfig, value: string) => void;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`h-4 w-4 ${color}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Endpoint
          </label>
          <input
            type="text"
            value={config.endpoint}
            onChange={(e) => onChange("endpoint", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="https://api.example.com/v1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Model Name
          </label>
          <input
            type="text"
            value={config.modelName}
            onChange={(e) => onChange("modelName", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="model-name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            API Key
          </label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => onChange("apiKey", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="sk-..."
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ModelSettings | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  const { isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await api.get<ModelSettings>("/settings/raw");
      return res.data;
    },
    refetchOnWindowFocus: false,
    select: (data) => {
      // Only set form state on initial load
      if (!form) setForm(data);
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (settings: ModelSettings) => {
      const res = await api.put("/settings", settings);
      return res.data;
    },
    onSuccess: () => {
      setSaveStatus("success");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const updateField = (
    section: "local" | "cloud" | "vision",
    field: keyof ModelConfig,
    value: string
  ) => {
    setForm((prev) =>
      prev ? { ...prev, [section]: { ...prev[section], [field]: value } } : prev
    );
  };

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Model Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure AI model endpoints and API keys. Changes take effect immediately.
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className="gap-1.5"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saveStatus === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : saveStatus === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveStatus === "success"
            ? "Saved!"
            : saveStatus === "error"
              ? "Error"
              : "Save"}
        </Button>
      </div>

      {/* Model Sections */}
      <ModelSection
        title="Local Model"
        icon={Server}
        config={form.local}
        onChange={(f, v) => updateField("local", f, v)}
        color="text-green-500"
      />

      <ModelSection
        title="Cloud Model"
        icon={Cloud}
        config={form.cloud}
        onChange={(f, v) => updateField("cloud", f, v)}
        color="text-blue-500"
      />

      <ModelSection
        title="Vision Model"
        icon={Eye}
        config={form.vision}
        onChange={(f, v) => updateField("vision", f, v)}
        color="text-violet-500"
      />
    </div>
  );
}
