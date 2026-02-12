import { ModelAdapter, LLMConfig } from './adapter';

export enum ModelCapability {
  BASIC = 'BASIC',       // Can only handle simple tasks
  ADVANCED = 'ADVANCED', // Can handle complex reasoning (CoT)
  UNUSABLE = 'UNUSABLE'  // Failed basic JSON test
}

export class CapabilityTester {
  private adapter: ModelAdapter;

  constructor(config: LLMConfig) {
    this.adapter = new ModelAdapter(config);
  }

  async runTests(): Promise<ModelCapability> {
    console.log('Running Capability Tests...');

    const jsonPassed = await this.testJsonStability();
    if (!jsonPassed) {
      console.warn('Model failed JSON stability test.');
      return ModelCapability.UNUSABLE;
    }

    const reasoningPassed = await this.testReasoning();
    if (reasoningPassed) {
      console.log('Model passed reasoning test. Rated as ADVANCED.');
      return ModelCapability.ADVANCED;
    }

    console.log('Model passed JSON but failed reasoning. Rated as BASIC.');
    return ModelCapability.BASIC;
  }

  private async testJsonStability(): Promise<boolean> {
    try {
      const prompt = 'Return a JSON object with a single key "status" and value "ok". Do not include markdown formatting.';
      const response = await this.adapter.chatCompletion([
        { role: 'user', content: prompt }
      ], true); // Request JSON mode

      const cleanContent = response.content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanContent);
      return parsed.status === 'ok';
    } catch (error) {
      console.error('JSON Test Failed:', error);
      return false;
    }
  }

  private async testReasoning(): Promise<boolean> {
    try {
      // reliable test for "smart" models vs "dumb" models
      const prompt = `Solve this: If I have 3 apples, eat 1, and buy 2 more, how many do I have? Return ONLY the number.`;
      const response = await this.adapter.chatCompletion([
        { role: 'user', content: prompt }
      ]);

      const answer = response.content.trim();
      return answer.includes('4');
    } catch (error) {
      return false;
    }
  }
}
