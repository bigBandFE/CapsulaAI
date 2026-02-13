import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// Settings file path (persisted across restarts)
const SETTINGS_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

export interface ModelSettings {
  local: {
    endpoint: string;
    modelName: string;
    apiKey: string;
  };
  cloud: {
    endpoint: string;
    modelName: string;
    apiKey: string;
  };
  vision: {
    endpoint: string;
    modelName: string;
    apiKey: string;
  };
}

function getDefaultSettings(): ModelSettings {
  return {
    local: {
      endpoint: process.env.LOCAL_MODEL_ENDPOINT || 'http://host.docker.internal:11434/v1',
      modelName: process.env.LOCAL_MODEL_NAME || 'qwen2.5:7b',
      apiKey: process.env.LOCAL_API_KEY || '',
    },
    cloud: {
      endpoint: process.env.CLOUD_MODEL_ENDPOINT || '',
      modelName: process.env.CLOUD_MODEL_NAME || '',
      apiKey: process.env.CLOUD_API_KEY || '',
    },
    vision: {
      endpoint: process.env.LOCAL_VISION_MODEL_ENDPOINT || process.env.LOCAL_MODEL_ENDPOINT || '',
      modelName: process.env.LOCAL_VISION_MODEL_NAME || process.env.LOCAL_MODEL_NAME || '',
      apiKey: process.env.LOCAL_VISION_API_KEY || process.env.LOCAL_API_KEY || '',
    },
  };
}

export function loadSettings(): ModelSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const saved = JSON.parse(raw) as Partial<ModelSettings>;
      // Merge with defaults to ensure all fields exist
      const defaults = getDefaultSettings();
      return {
        local: { ...defaults.local, ...saved.local },
        cloud: { ...defaults.cloud, ...saved.cloud },
        vision: { ...defaults.vision, ...saved.vision },
      };
    }
  } catch (e) {
    console.warn('[Settings] Failed to load settings file, using defaults:', e);
  }
  return getDefaultSettings();
}

function saveSettings(settings: ModelSettings): void {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// Callback for hot-reloading worker config
let onSettingsChanged: ((settings: ModelSettings) => void) | null = null;

export function onSettingsUpdate(callback: (settings: ModelSettings) => void) {
  onSettingsChanged = callback;
}

// GET /api/settings — return current config (API keys masked)
router.get('/', (req: Request, res: Response) => {
  const settings = loadSettings();

  // Return masked version for display
  const masked: ModelSettings = {
    ...settings,
    local: { ...settings.local, apiKey: maskKey(settings.local.apiKey) },
    cloud: { ...settings.cloud, apiKey: maskKey(settings.cloud.apiKey) },
    vision: { ...settings.vision, apiKey: maskKey(settings.vision.apiKey) },
  };

  res.json(masked);
});

// GET /api/settings/raw — return full config (for internal use)
router.get('/raw', (req: Request, res: Response) => {
  res.json(loadSettings());
});

// PUT /api/settings — update config
router.put('/', (req: Request, res: Response) => {
  try {
    const current = loadSettings();
    const update = req.body as Partial<ModelSettings>;

    // Merge updates: preserve existing API keys if masked value sent
    const merged: ModelSettings = {
      local: {
        endpoint: update.local?.endpoint ?? current.local.endpoint,
        modelName: update.local?.modelName ?? current.local.modelName,
        apiKey: isMasked(update.local?.apiKey) ? current.local.apiKey : (update.local?.apiKey ?? current.local.apiKey),
      },
      cloud: {
        endpoint: update.cloud?.endpoint ?? current.cloud.endpoint,
        modelName: update.cloud?.modelName ?? current.cloud.modelName,
        apiKey: isMasked(update.cloud?.apiKey) ? current.cloud.apiKey : (update.cloud?.apiKey ?? current.cloud.apiKey),
      },
      vision: {
        endpoint: update.vision?.endpoint ?? current.vision.endpoint,
        modelName: update.vision?.modelName ?? current.vision.modelName,
        apiKey: isMasked(update.vision?.apiKey) ? current.vision.apiKey : (update.vision?.apiKey ?? current.vision.apiKey),
      },
    };

    saveSettings(merged);
    console.log('[Settings] Configuration updated and saved.');

    // Trigger hot-reload
    if (onSettingsChanged) {
      onSettingsChanged(merged);
    }

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('[Settings] Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? '****' : '';
  return key.slice(0, 6) + '****' + key.slice(-4);
}

function isMasked(key?: string): boolean {
  return !!key && key.includes('****');
}

export default router;
