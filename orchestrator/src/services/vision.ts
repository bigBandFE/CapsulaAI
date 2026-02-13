import fs from 'fs';
import pdfRequest from 'pdf-parse';
import { ModelAdapter, LLMConfig } from '../ai/adapter';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif']);
const PDF_EXTENSIONS = new Set(['pdf']);

export class VisionService {
  private static adapter: ModelAdapter | null = null;

  static configure(config: LLMConfig) {
    this.adapter = new ModelAdapter(config);
    console.log(`[Vision] VLM configured: ${config.endpoint} / ${config.modelName}`);
  }

  /**
   * Analyze any file using VLM.
   * - Images → sent as base64 image_url to VLM
   * - PDFs → extract text and send as text prompt to VLM
   * - Other files → content read as text and analyzed by VLM
   */
  static async analyzeFile(filePath: string): Promise<string> {
    if (!this.adapter) {
      throw new Error('[Vision] VLM not configured. Call VisionService.configure() first.');
    }

    const ext = filePath.split('.').pop()?.toLowerCase() || '';

    if (IMAGE_EXTENSIONS.has(ext)) {
      return this.analyzeImage(filePath, ext);
    } else if (PDF_EXTENSIONS.has(ext)) {
      return this.analyzePDF(filePath);
    } else {
      return this.analyzeGenericFile(filePath, ext);
    }
  }

  /** Backward-compatible alias */
  static async extractText(filePath: string): Promise<string> {
    return this.analyzeFile(filePath);
  }

  private static async analyzeImage(imagePath: string, ext: string): Promise<string> {
    console.log(`[Vision] Running VLM Image Analysis on ${imagePath}`);

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Data = imageBuffer.toString('base64');

    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
      'png': 'image/png', 'webp': 'image/webp',
      'gif': 'image/gif', 'bmp': 'image/bmp',
      'tiff': 'image/tiff', 'tif': 'image/tiff',
    };
    const mimeType = mimeMap[ext] || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    const response = await this.adapter!.chatCompletion([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this image thoroughly. Provide:
1. A detailed description of what the image contains
2. ALL text visible in the image (OCR)
3. Key subjects, objects, people, or scenes
4. Any notable details, brands, locations, or context clues

Format your response as a comprehensive description that captures the full meaning and content of the image.`
          },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]);

    return response.content;
  }

  private static async analyzePDF(pdfPath: string): Promise<string> {
    console.log(`[Vision] Running VLM PDF Analysis on ${pdfPath}`);

    try {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const data = await pdfRequest(pdfBuffer);
      const textContent = data.text;

      console.log(`[Vision] Extracted ${textContent.length} chars from PDF.`);

      // Truncate if too long (though Kimi supports 200k, let's be safe for general OpenAI case)
      // 100k chars is roughly 25k-30k tokens.
      const MAX_CHARS = 100000;
      const truncated = textContent.length > MAX_CHARS;
      const contentToSend = truncated ? textContent.substring(0, MAX_CHARS) : textContent;

      const response = await this.adapter!.chatCompletion([
        {
          role: 'user',
          content: `Analyze this PDF document content thoroughly. Provide:
1. A comprehensive summary of the document content
2. Key topics, themes, and important data points
3. Any tables, charts, or structured data described
4. Notable metadata (author, title, dates if visible)

${truncated ? '\n(Note: Document was truncated due to size. Only first portion shown.)\n' : ''}

--- DOCUMENT CONTENT ---
${contentToSend}
--- END DOCUMENT CONTENT ---

Format your response as a detailed, well-structured analysis that captures the full meaning and content of the document.`
        }
      ]);

      return response.content;
    } catch (error) {
      console.error('[Vision] PDF Extraction Failed:', error);
      return `[Vision Error] Failed to extract text from PDF: ${error}`;
    }
  }

  private static async analyzeGenericFile(filePath: string, ext: string): Promise<string> {
    console.log(`[Vision] Running VLM Text Analysis on ${filePath} (${ext})`);

    // Try to read as text
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    } catch {
      // Binary file that we can't read as text
      return `[Vision] Unable to extract content from binary file: ${filePath}`;
    }

    // Truncate very large files to avoid token limits
    const MAX_CHARS = 50000;
    const truncated = fileContent.length > MAX_CHARS;
    const content = truncated ? fileContent.substring(0, MAX_CHARS) : fileContent;

    const response = await this.adapter!.chatCompletion([
      {
        role: 'user',
        content: `Analyze this ${ext.toUpperCase()} file content thoroughly. Provide:
1. A comprehensive summary of what this file contains
2. Key topics, data points, and important information
3. The structure and organization of the content
4. Any notable details or insights
${truncated ? '\n(Note: File was truncated due to size. Only first portion shown.)\n' : ''}

--- FILE CONTENT ---
${content}
--- END FILE CONTENT ---

Format your response as a detailed analysis that captures the full meaning and content of the file.`
      }
    ]);

    return response.content;
  }
}
