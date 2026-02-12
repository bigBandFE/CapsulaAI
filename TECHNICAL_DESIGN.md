# CapsulaAI Technical Architecture & Design

> **Philosophy**: Local-First, Privacy-Focused, Cloud-Enhanced.
> **Mission**: To capture, structure, and connect personal knowledge with absolute privacy.

## 1. System Architecture Overview
The system follows a micro-service architecture orchestrated by a unified Node.js backend.

### 1.1. Core Components
-   **Orchestrator (Node.js/Express)**: The central brain. Handles API requests, task scheduling, and model routing.
-   **Database (PostgreSQL + pgvector)**: Stores structured knowledge (JSONB) and semantic embeddings.
-   **Object Storage (MinIO)**: Stores raw assets (Images, PDFs, Audio) locally.
-   **AI Worker**: A background process that polls for `PENDING` capsules and executes the AI Pipeline.

### 1.2. Technology Stack
-   **Runtime**: Node.js (TypeScript)
-   **ORM**: Prisma
-   **Vector DB**: pgvector
-   **AI SDK**: `@anthropic-ai/sdk` (Standardized Protocol)
-   **Containerization**: Docker Compose

---

## 2. The AI Pipeline ("The Brain")
Our pipeline ensures privacy while leveraging cloud intelligence for complex tasks.

### 2.1. Dual-Model Strategy
We utilize two tiers of models:
1.  **Local Model (Privacy & Speed)**:
    -   Role: 1st line of defense. Handles simple extraction, complexity analysis, and PII restoration.
    -   Default: `Minimax-M2.1` (Simulated Local), `Qwen2.5-7B` (Real Local via Ollama).
2.  **Cloud Model (Enhancement)**:
    -   Role: "The Specialist". Handles complex reasoning, long summarization, and fallback recovery.
    -   Strict Rule: **Cloud never sees raw PII.** All data sent to cloud is sanitized first.

### 2.2. Processing Workflow
1.  **Ingestion**: User uploads text/file -> `Capsule` created (Status: `PENDING`).
2.  **Complexity Analysis (Router)**:
    -   Worker uses Local Model to analyze content difficulty.
    -   Result: `SIMPLE` (Process Locally) or `COMPLEX` (Process on Cloud).
3.  **Sanitization (Privacy Guard)**:
    -   If routing to Cloud, the **Sanitizer** module detects and redacts PII (Names, Emails, Phones) -> `***`.
4.  **Extraction**:
    -   The selected model executes the prompt to verify specific schemas.
    -   **Cloud Escalation**: If Local model produces invalid JSON, the task is automatically escalated to Cloud.
5.  **Restoration**:
    -   If sanitized, the original PII is restored into the structured JSON result locally.
6.  **Embedding**:
    -   Vector embeddings are generated for the final content to enable semantic search.

---

## 3. Data Model & Extensibility
The core data structure is designed for flexibility and forward compatibility.

### 3.1. Capsule Schema (Postgres)
```prisma
model Capsule {
  id              String      @id @default(uuid())
  status          CapsuleStatus // PENDING, PROCESSING, COMPLETED
  sourceType      SourceType    // NOTE, IMAGE, etc.
  originalContent String?       @db.Text
  structuredData  Json?         // The flexible knowledge payload
  embeddings      Embedding[]
}
```

### 3.2. Structured Data (JSON)
The `structuredData` field follows a standardized schema but is extensible.
```json
{
  "meta": {
    "title": "Discussion with John",
    "created_at": "2023-10-27"
  },
  "content": {
    "summary": "...",
    "key_points": ["..."]
  },
  "schema_version": "v1.0"  // Critical for evolution
}
```

### 3.3. Data Evolution Strategy
-   **Forward Compatibility**: New features add keys (e.g., `shopping_items`) to JSONB without migration.
-   **Regression/Backfill**:
    -   All outputs are tagged with `schema_version`.
    -   When logic improves (v2), a background job can re-process v1 items using the immutable `originalContent`.

---

## 4. Capability Roadmap (Phase 2 & Beyond)

Based on the strategic "Scenario Reinforcement Table", here is the technical roadmap:

| Priority | Capability | Technical & Architectural Implications |
| :--- | :--- | :--- |
| ⭐⭐⭐⭐⭐ | **Entity System** (Structurization) | **Status: Next Step**. <br> - **Schema**: Add `Entity` table or nested JSONB structures for Person, Org, Location. <br> - **Prompt**: Update `PromptEngine` to extract rich attributes. <br> - **Graph**: Link Capsules via shared Entities. |
| ⭐⭐⭐⭐⭐ | **Action Extraction** (Actionability) | **Status: Priority**. <br> - **Schema**: New `Action` array in JSON (Todo, Reminder). <br> - **Logic**: Detect actionable intent from "Notes" and "Chats". |
| ⭐⭐⭐⭐⭐ | **Inbox Intelligence** (Passive Ingestion) | **Status: Priority**. <br> - **API**: Add `/api/ingest/url` and `/api/ingest/clipboard`. <br> - **Worker**: Add `CrawlerService` to fetch URL content before AI processing. |
| ⭐⭐⭐⭐ | **Memory Evolution** (Long-term) | **Logic**: "Merge" jobs. Background worker that clusters similar capsules and creates a "Super Capsule" (Summary of summaries). |
| ⭐⭐⭐⭐ | **Vision Capsules** (Multimodal) | **AI**: Use Multimodal Models (Minimax/Claude Vision). <br> - **Input**: Pass Image Buffer to Model Adapter. |
| ⭐⭐⭐ | **Private Research Agent** (Q&A) | **RAG**: Retrieval-Augmented Generation using `pgvector`. Queries across multiple capsules. |
| ⭐⭐⭐ | **Self-Improving Memory** (Feedback) | **API**: `POST /capsules/:id/feedback`. <br> - **Training**: Use feedback to fine-tune few-shot examples in `PromptEngine`. |

---

## 5. Future Extensibility
The architecture supports new scenarios without refactoring the core:
-   **Shopping**: Add `getShoppingPrompt` -> Worker Routes to it -> JSONB stores items.
-   **Reminders**: Extract dates -> Index them on a separate table (optimization) or JSON query.
-   **Video**: Add `FFmpeg` to Worker -> Extract Audio/Frames -> Feed to existing Text/Image pipeline.
