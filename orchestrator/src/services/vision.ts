import { createWorker } from 'tesseract.js';
import fs from 'fs';
import { ModelAdapter, LLMConfig } from '../ai/adapter';

// Interface for Vision Strategies
interface IVisionStrategy {
  extractText(imagePath: string): Promise<string>;
}

// Strategy 1: Local Tesseract (Offline, Privacy-First)
class LocalVisionStrategy implements IVisionStrategy {
  async extractText(imagePath: string): Promise<string> {
    console.log(`[Vision] Running Local OCR (Tesseract) on ${imagePath}`);
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    return text;
  }
}

// Strategy 2: Local/Cloud VLM (LLM)
class VLMStrategy implements IVisionStrategy {
  private adapter: ModelAdapter;

  constructor(config: LLMConfig) {
    this.adapter = new ModelAdapter(config);
  }

  async extractText(imagePath: string): Promise<string> {
    console.log(`[Vision] Running VLM Analysis (LLM) on ${imagePath}`);

    // MOCK for now to avoid FS issues in Docker without volume bind
    const base64Mock = "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const response = await this.adapter.chatCompletion([
      {
        role: 'user',
        content: [
          { type: 'text', text: "OCR Task: Transcribe ALL text in this image exactly. Do not describe the image, just return the text found." },
          { type: 'image_url', image_url: { url: base64Mock } }
        ]
      }
    ]);

    return response.content;
  }
}

export class VisionService {
  private static strategy: IVisionStrategy = new LocalVisionStrategy();

  static configure(mode: 'TESSERACT' | 'LLM', config?: LLMConfig) {
    if (mode === 'LLM' && config) {
      this.strategy = new VLMStrategy(config);
    } else {
      this.strategy = new LocalVisionStrategy();
    }
  }

  static async extractText(imagePath: string): Promise<string> {
    return this.strategy.extractText(imagePath);
  }
}
