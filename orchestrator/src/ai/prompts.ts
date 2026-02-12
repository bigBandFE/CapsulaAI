import { ModelCapability } from './tester';

export class PromptEngine {
  static getExtractionPrompt(text: string, capability: ModelCapability): string {
    const baseSchema = `
    {
      "meta": {
        "title": "string",
        "created_at": "ISO string",
        "language": "en/zh"
      },
      "content": {
        "summary": "string",
        "key_points": ["string array"]
      },
      "entities": [
        {
          "name": "string",
          "type": "PERSON | ORGANIZATION | LOCATION | DATE | MONEY",
          "role": "optional string (for PERSON)",
          "contact": "optional string (email/phone)",
          "amount": "optional number (for MONEY)",
          "currency": "optional string (for MONEY)",
          "isoString": "optional string (for DATE)"
        }
      ],
      "actions": [
        {
          "type": "TODO | REMINDER | FOLLOW_UP",
          "description": "string",
          "deadline": "optional string (ISO date for TODO)",
          "priority": "HIGH | MEDIUM | LOW (for TODO)",
          "triggerTime": "optional string (ISO date for REMINDER)",
          "person": "optional string (for FOLLOW_UP)"
        }
      ],
      "tags": ["string array"]
    }
    `;

    if (capability === ModelCapability.ADVANCED) {
      // CoT Prompt for smart models
      return `
      You are an expert knowledge curator. Analyze the following text and extract structured insights.
      
      Step 1: Identify the main topic and key entities (People, Organizations, Locations, Dates, Money).
      Step 2: Identify any actionable items (Todos, Reminders, Follow-ups).
      Step 3: Summarize the core message in 1-2 sentences.
      Step 4: Extract key points and suggest relevant tags.
      Step 5: Output the result strictly in the following JSON format:
      ${baseSchema}

      Entity Extraction Rules:
      - PERSON: Extract role and contact info if available.
      - MONEY: Extract numerical amount and currency.
      - DATE: Normalize to ISO format if possible.

      Action Extraction Rules:
      - TODO: Extract tasks with clear deadlines or priorities.
      - REMINDER: Extract specific time-based alerts.
      - FOLLOW_UP: Extract interpersonal follow-ups.

      Text to analyze:
      ${text}
      `;
    } else {
      // Few-shot / Direct prompt for basic models
      return `
      EXTRACT JSON FROM TEXT. 
      Schema: ${baseSchema}
      
      Text: "${text}"
      
      JSON OUTPUT:
      `;
    }
  }
  static getComplexityAnalysisPrompt(text: string): string {
    return `
Analyze the following text to determine if it requires complex reasoning to understand or if it is simple factual information.
Return valid JSON only: { "complexity": "SIMPLE" } or { "complexity": "COMPLEX" }.

Criteria for COMPLEX:
- Text is long (> 500 words)
- Requires summarization of abstract concepts
- Contains ambiguous logic

Criteria for SIMPLE:
- Short messages or notes
- Clear lists of items
- Contact information only

Text:
"${text.substring(0, 1000)}" 
`;
  }
}
