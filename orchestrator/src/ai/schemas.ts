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
  actions?: Action[]; // New field for actions
  tags: string[];
  relations?: {
    target_id: string;
    type: string;
  }[];
  schema_version: string;
}
