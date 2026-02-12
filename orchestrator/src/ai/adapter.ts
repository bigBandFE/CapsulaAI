
import Anthropic from '@anthropic-ai/sdk';

export interface LLMConfig {
  endpoint: string;
  modelName: string;
  apiKey?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }; // OpenAI style, mapped to Anthropic

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ChatResponse {
  content: string;
  usage?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  };
}

export class ModelAdapter {
  private client: Anthropic;
  private modelName: string;

  constructor(config: LLMConfig) {
    this.modelName = config.modelName;

    // Minimax Anthropic Compatibility Configuration
    // The key point is baseURL: "https://api.minimax.io/anthropic" (from docs)
    // or whatever the user configures in .env
    this.client = new Anthropic({
      baseURL: config.endpoint,
      apiKey: config.apiKey || 'sk-dummy',
    });
  }

  async chatCompletion(messages: ChatMessage[], jsonMode: boolean = false): Promise<ChatResponse> {
    try {
      // Convert standard messages to Anthropic format
      // Anthropic requires 'system' to be a top-level parameter, not in messages list
      let systemPrompt: string | undefined = undefined;
      const anthropicMessages: Anthropic.MessageParam[] = [];

      for (const msg of messages) {
        if (msg.role === 'system') {
          if (typeof msg.content === 'string') {
            systemPrompt = msg.content;
          } else {
            console.warn('System prompt should be string');
            systemPrompt = JSON.stringify(msg.content);
          }
        } else {
          // Handle Multimodal Content
          let processedContent: string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;

          if (typeof msg.content === 'string') {
            processedContent = msg.content;
          } else {
            // Map generic ContentBlock to Anthropic Block
            processedContent = msg.content.map(block => {
              if (block.type === 'image_url') {
                // Determine media type from base64 header or default to jpeg
                // e.g., data:image/jpeg;base64,...
                const match = block.image_url.url.match(/^data:(image\/[a-z]+);base64,(.+)$/);
                const mediaType = (match ? match[1] : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
                const data = match ? match[2] : block.image_url.url; // Fallback if raw base64

                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: data
                  }
                } as Anthropic.ImageBlockParam;
              } else {
                return { type: 'text', text: block.text } as Anthropic.TextBlockParam;
              }
            });
          }

          anthropicMessages.push({
            role: msg.role as 'user' | 'assistant',
            content: processedContent as any // Anthropic SDK types can be tricky
          });
        }
      }

      // Add JSON instruction for basic models if jsonMode is requested
      // (Anthropic models are usually smart enough, but prompt reinforcement helps)
      if (jsonMode && !systemPrompt?.includes('JSON')) {
        const jsonInstruction = "Return valid JSON only.";
        if (systemPrompt) systemPrompt += `\n${jsonInstruction}`;
        else systemPrompt = jsonInstruction;
      }

      const response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 4096, // Minimax/Anthropic usually requires max_tokens
        system: systemPrompt,
        messages: anthropicMessages,
      });

      // Handle response content
      let content = '';
      if (response.content && response.content.length > 0) {
        // Anthropic returns a list of blocks (text, thinking, tool_use)
        // We prioritize text blocks
        for (const block of response.content) {
          if (block.type === 'text') {
            content += block.text;
          }
        }
      }

      const usage = {
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0
      };

      return {
        content,
        usage,
      };
    } catch (error) {
      console.error('ModelAdapter (Anthropic SDK) Execution Failed:', error);
      throw error;
    }
  }
}
