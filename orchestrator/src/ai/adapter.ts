
import OpenAI from 'openai';

export interface LLMConfig {
  endpoint: string;
  modelName: string;
  apiKey?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

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
  private client: OpenAI;
  private modelName: string;

  constructor(config: LLMConfig) {
    this.modelName = config.modelName;

    // Initialize OpenAI Client with custom base URL
    // Compatible with MiniMax, Moonshot (Kimi), and standard OpenAI
    this.client = new OpenAI({
      baseURL: config.endpoint,
      apiKey: config.apiKey || 'sk-dummy',
      dangerouslyAllowBrowser: true // Just in case, though this is backend
    });

    console.log(`[ModelAdapter] Initialized for ${config.modelName} @ ${config.endpoint}`);
    if (config.apiKey) {
      console.log(`[ModelAdapter] API Key used: ${config.apiKey.substring(0, 8)}...${config.apiKey.substring(config.apiKey.length - 4)}`);
    } else {
      console.warn('[ModelAdapter] No API Key provided!');
    }
  }

  async chatCompletion(messages: ChatMessage[], jsonMode: boolean = false): Promise<ChatResponse> {
    try {
      // Convert internal messages to OpenAI format
      const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(msg => {
        if (typeof msg.content === 'string') {
          return {
            role: msg.role,
            content: msg.content
          } as OpenAI.Chat.ChatCompletionMessageParam;
        } else if (Array.isArray(msg.content)) {
          // Map ContentBlocks to OpenAI ContentParts
          const contentParts = msg.content.map(block => {
            if (block.type === 'image_url') {
              return {
                type: 'image_url',
                image_url: {
                  url: block.image_url.url
                }
              } as OpenAI.Chat.ChatCompletionContentPartImage;
            } else {
              return {
                type: 'text',
                text: block.text
              } as OpenAI.Chat.ChatCompletionContentPartText;
            }
          });

          // Workaround for strict OpenAI typings requiring specific role interfaces when using Array content
          if (msg.role === 'user') {
            return {
              role: 'user',
              content: contentParts
            } as OpenAI.Chat.ChatCompletionUserMessageParam;
          } else {
            return {
              role: msg.role,
              content: contentParts as any // fallback for other roles that might not natively support arrays in all SDK versions strictly
            } as OpenAI.Chat.ChatCompletionMessageParam;
          }
        }

        return {
          role: msg.role,
          content: String(msg.content)
        } as OpenAI.Chat.ChatCompletionMessageParam;
      });

      // Add JSON instruction if requested
      if (jsonMode) {
        // Find or create system message
        let systemMsg = openaiMessages.find(m => m.role === 'system');
        if (!systemMsg) {
          systemMsg = { role: 'system', content: '' } as OpenAI.Chat.ChatCompletionSystemMessageParam;
          openaiMessages.unshift(systemMsg);
        }

        // Append instruction
        const jsonInstruction = "Return valid JSON only.";
        if (typeof systemMsg.content === 'string') {
          if (!systemMsg.content.includes('JSON')) {
            systemMsg.content += `\n${jsonInstruction}`;
          }
        }
      }

      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: openaiMessages,
        response_format: jsonMode ? { type: 'json_object' } : undefined,
        max_tokens: 4096,
      });

      const choice = response.choices[0];
      let content = choice.message.content || '';

      // Clean up <think> blocks (DeepSeek/MiniMax style)
      // Removes <think>...</think> and unclosed <think>...
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      content = content.replace(/<think>[\s\S]*/g, '').trim();

      // If jsonMode is enabled, try to extract JSON if it's wrapped in markdown
      if (jsonMode) {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          content = jsonMatch[1].trim();
        }
      }

      const usage = {
        totalTokens: response.usage?.total_tokens || 0,
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0
      };

      return {
        content,
        usage,
      };
    } catch (error) {
      console.error('ModelAdapter (OpenAI SDK) Execution Failed:', error);
      throw error;
    }
  }
}
