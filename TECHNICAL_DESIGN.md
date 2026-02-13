# CapsulaAI Technical Design

## 1. System Overview

CapsulaAI is a **Local-First Knowledge Management System** designed to capture, structure, and retrieve personal memory with privacy at its core. It transforms unstructured data (text, images, URLs) into a structured Knowledge Graph through an AI-powered pipeline.

### Core Philosophy
- **Local-First**: All data (DB, Objects, Vectors) stored locally.
- **Privacy-Centric**: AI inference happens on user-controlled endpoints (Local LLM or Private Cloud API).
- **Graph-Based**: Knowledge is stored as interconnected entities, not just documents.

---

## 2. Architecture

The system follows a modular microservices-like architecture, orchestrated via Docker Compose.

```mermaid
graph TD
    User[User (Web/Mobile)] <--> Nginx[Nginx / Web Container]
    Nginx <--> Frontend[React SPA (Port 5173)]
    Frontend <--> API[Orchestrator API (Port 3000)]
    
    subgraph "Data Layer"
        API <--> DB[(Postgres + pgvector)]
        API <--> MinIO[(MinIO Object Storage)]
    end

    subgraph "AI Processing"
        API --> Queue[BullMQ (Redis-based, internal)]
        Queue --> Worker[Worker Process]
        Worker --> VLM[Vision Model (Moonshot/Kimi)]
        Worker --> LLM[Text Model (MiniMax)]
        Worker --> Embed[Embedding Model]
    end
    
    subgraph "External World"
        Worker --> Crawler[Puppeteer Headless Browser]
        Crawler --> Websites[Target URLs]
    end
```

### Components
1.  **Frontend (Web)**
    *   **Stack**: React, TypeScript, Vite, TailwindCSS, Shadcn UI.
    *   **State**: React Query (TanStack Query) for async data, Zustand for local state.
    *   **Key Libraries**: `reactflow` (Graph), `lucide-react` (Icons).

2.  **Orchestrator (Backend)**
    *   **Stack**: Node.js, Express, TypeScript.
    *   **Role**: API Gateway, Business Logic, AI Orchestration.
    *   **Queue**: In-memory (or Redis-backed via BullMQ) job queue for async AI tasks.

3.  **Database (PostgreSQL)**
    *   **Extensions**: `pgvector` for semantic search.
    *   **ORM**: Prisma.
    *   **Role**: Relational data (User, Capsule, Entity) + Vector Embeddings.

4.  **Object Storage (MinIO)**
    *   **Protocol**: S3-compatible.
    *   **Role**: Storing raw assets (images, PDFs, screenshots).

---

## 3. Data Model

### 3.1 Core Entities

#### Capsule
The fundamental unit of memory.
- `id`: UUID
- `content`: Raw text or OCR result.
- `type`: `NOTE`, `IMAGE`, `LINK`.
- `embedding`: Vector(1536) for semantic search.
- `status`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.

#### Entity & Relation (Knowledge Graph)
Extracted knowledge points.
- **Entity**: `Person`, `Organization`, `Location`, `Event`, `Concept`.
- **Relation**: Directed edge between entities (e.g., `WORKS_AT`, `LOCATED_IN`, `CREATED`).

#### Activity & Timeline
- Logs interactions and updates for "Self-Improving Memory".
- Heatmap generation based on creation/access timestamps.

### 3.2 Schema Visualization
```mermaid
erDiagram
    Capsule ||--o{ Asset : contains
    Capsule ||--o{ Entity : mentions
    Entity ||--o{ Relation : source
    Entity ||--o{ Relation : target
    Capsule {
        string id PK
        string content
        vector embedding
        enum status
    }
    Entity {
        string id PK
        string name
        string type
        json metadata
    }
    Relation {
        string id PK
        string type
    }
```

---

## 4. AI Pipeline

The pipeline transforms raw input into structured knowledge.

1.  **Ingestion**: User uploads file or URL.
    - *Action*: File stored in MinIO. Capsule created with status `PENDING`.
2.  **Scheduling**: Orchestrator picks up `PENDING` capsule.
3.  **Processing (Worker)**:
    - **Vision (VLM)**: If image/PDF, send to Vision Model (Kimi) -> Get description & OCR.
    - **Crawling**: If URL, Puppeteer fetches content -> `readability` extracts text.
    - **Analysis (LLM)**: Text sent to LLM (MiniMax) with "Extraction Prompt".
        - *Output*: JSON containing Summary, Entities, Relations, Tags.
    - **Embedding**: Summary text sent to Embedding Model -> Vector.
4.  **Storage**:
    - Update Capsule with Summary & Vector.
    - Upsert Entities & Relations to Graph (deduplication based on name/type).
5.  **Completion**: Status set to `COMPLETED`. Real-time update via WebSocket/Polling.

---

## 5. Security & Privacy

### API Key Management
- Keys are stored locally in `orchestrator/data/settings.json`.
- Not committed to Git (via `.gitignore`).
- Environment variables (`.env`) serve as default/template.

### Data Sovereignty
- All data resides in `postgres_data` and `minio_data` Docker volumes on the user's machine.
- No telemetry or usage data is sent to CapsulaAI developers.
- External API calls (MiniMax/Moonshot) are the only data egress, strictly for inference.

---

## 6. Future Scalability

- **Local LLM**: Switch from commercial APIs to Ollama (Llama 3, Mistral) for 100% offline capability.
- **Multi-User**: Current design is single-tenant. Authentication middleware can be added for multi-user support.
- **Federation**: Sync knowledge graphs between devices (P2P).
