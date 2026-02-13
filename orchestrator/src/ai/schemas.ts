export interface EntityBase {
  name: string;
  confidence: number; // 0-1
  mentions: string[]; // Original text snippets
}

export interface Person extends EntityBase {
  type: 'PERSON';
  role?: string; // e.g. CEO, Engineer
  contact?: string; // Email or Phone
  relationship?: string; // User's relationship to them
}

export interface Organization extends EntityBase {
  type: 'ORGANIZATION';
  industry?: string;
  location?: string;
}

export interface Location extends EntityBase {
  type: 'LOCATION';
  address?: string;
  coordinates?: [number, number]; // Lat, Long
}

export interface DateEntity extends EntityBase {
  type: 'DATE';
  isoString?: string; // Normalized ISO date
  isRelative: boolean; // "tomorrow" vs "2023-10-27"
}

export interface Money extends EntityBase {
  type: 'MONEY';
  amount: number;
  currency: string;
}

// Union type for all supported entities
export type Entity = Person | Organization | Location | DateEntity | Money;

// Action Interfaces
export interface ActionBase {
  description: string;
  confidence: number;
}

export interface Todo extends ActionBase {
  type: 'TODO';
  deadline?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface Reminder extends ActionBase {
  type: 'REMINDER';
  triggerTime: string; // ISO date
}

export interface FollowUp extends ActionBase {
  type: 'FOLLOW_UP';
  person: string; // Name of person to follow up with
  topic?: string;
}

export type Action = Todo | Reminder | FollowUp;

// Relationship Interfaces (Phase 3.1)
export interface Relationship {
  from: string;           // Entity name
  fromType: string;       // Entity type
  to: string;             // Entity name
  toType: string;         // Entity type
  type: 'WORKS_FOR' | 'FOUNDED' | 'INVESTED_IN' | 'LOCATED_IN' | 'ACQUIRED' |
  'PARTNERED_WITH' | 'REPORTS_TO' | 'OWNS' | 'ATTENDED' | 'MENTIONED_WITH' | 'OTHER';
  confidence: number;     // 0-1
  metadata?: {
    title?: string;       // Job title, role
    startDate?: string;   // ISO date
    endDate?: string;     // ISO date
    amount?: string;      // Investment/acquisition amount
    round?: string;       // Funding round
    description?: string; // Additional context
  };
}

// Extended Capsule Structure
export interface CapsuleStructuredData {
  meta: {
    title: string;
    created_at?: string;
    source_url?: string;
    language?: string;
  };
  content: {
    full_text?: string;
    summary: string;
    key_points: string[];
  };
  entities: Entity[];
  actions?: Action[];
  relationships?: Relationship[]; // Phase 3.1: Entity relationships
  tags: string[];
  schema_version: string;
}
