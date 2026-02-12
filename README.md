# 🧠 CapsulaAI

> A private AI knowledge hub powered by Docker — extracting, structuring, and retrieving your multi-modal information with local-first privacy.

## 🌟 Vision

**CapsulaAI** is a私有 AI knowledge中枢 that solves information fragmentation through automated multi-modal extraction and intelligent retrieval — all while keeping your sensitive data under your control.

## 🎯 The Problem We Solve

| Pain Point | CapsulaAI Solution |
|------------|-------------------|
| Information scattered everywhere (screenshots, docs, notes) | Unified ingestion via web & plugins |
| Manual tagging is tedious | AI-automated structure extraction |
| Privacy anxiety with cloud AI | **Local-first** architecture — zero data leakage by default |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Layer                            │
│    (Web Dashboard / Browser Plugins / API)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Orchestrator (Node.js)                          │
│    • Task Scheduling  • PII Sanitization  • API Routing       │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌───────────────────┐               ┌───────────────────────┐
│  Model Adapter    │               │    Local Worker        │
│ (OpenAI-compatible│               │  • OCR Processing      │
│  protocol)        │               │  • Embedding Generation│
└───────────────────┘               └───────────────────────┘
          │                                       │
          ▼                                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Capsule Storage Layer                          │
│    Postgres (Metadata) + pgvector (Vectors) + MinIO (Files) │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

- **Orchestrator**: Node.js-based task scheduler, PII detection, and API router
- **Model Adapter**: OpenAI `/v1/chat/completions` compatible — works with Ollama, vLLM, or custom local models
- **Capsule Storage**: PostgreSQL (metadata) + pgvector (vector search) + MinIO (local file storage)
- **Local Worker**: Handles local OCR and embedding generation

## ✨ Key Features

### 1. 📦 Capsule Data Model
All inputs are standardized into a unified **Capsule JSON** structure — the atomic unit of knowledge in CapsulaAI.

### 2. 🔄 AI Pipeline (Fully Automated)

```
Input (Image/PDF/Text) → Local OCR → Model Extraction → Structured Capsule → Storage + Vector Index
```

### 3. 🛡️ Privacy Sanitizer

When complex reasoning requires cloud models:
1. **Local Detection**: Identify PII (personally identifiable information)
2. **Placeholder Replacement**: Replace real names/numbers with `IDENTIFIER_A`, etc.
3. **Result Restoration**: Restore original data after cloud processing

**Result**: You get cloud AI capabilities without exposing sensitive data.

### 4. 🔍 Intelligent Retrieval

- **Semantic Search**: Ask questions like "Where are my travel documents for next year?"
- **Multi-dimensional Filtering**: Filter by category (ID, ideas, work docs) and time
- **Association Search (P2)**: Auto-suggest related capsules when viewing one

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Local model API (Ollama, vLLM, or custom OpenAI-compatible API)

### Deployment

```bash
# Clone the repository
git clone https://github.com/The-Zen-Story/CapsulaAI.git
cd CapsulaAI

# Configure your local model endpoint
# Edit .env with your Ollama/vLLM API address

# Start with Docker
docker-compose up -d
```

### Configuration

Set your local model API in the environment:
```bash
MODEL_API_BASE=http://localhost:11434/v1
MODEL_NAME=qwen2.5:7b
```

## 📖 User Flow

1. **Deploy & Configure**: Start Docker container, configure your local model API
2. **Model Self-Test**: System runs test cases to confirm JSON output capability
3. **Collect**: Snap photos or upload screenshots anytime
4. **Automate**: System silently processes and archives in background
5. **Retrieve**: Query via chat or search when you need information

## 🔒 Privacy First

- **Zero Data Leakage**: All traffic stays within Docker and local network by default
- **Hardware Agnostic**: No GPU dependencies — inference load on your external model API
- **Portable**: Independent data volumes for one-click backup and migration

## 🎯 Business Value

| Aspect | Value |
|--------|-------|
| **Moat** | Not the AI model — it's your **private structured knowledge graph** |
| **Scalability** | Enterprise private knowledge base ↔ Personal NAS |
| **Positioning** | The gap between "public cloud AI" and "pure offline tools" — **controllable advanced intelligence** |

## 📅 Roadmap

See our [Milestones](docs/milestones.md) for detailed development plans.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](docs/CONTRIBUTING.md) for details.

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

**Built with ❤️ by The Zen Story**
