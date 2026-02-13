# CapsulaAI Deployment Guide

This guide explains how to deploy CapsulaAI using Docker Compose.

## Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed.
- Git (to clone the repository).
- API Keys for MiniMax and Moonshot (Kimi) AI models.

## Deployment Steps

### 1. Clone the Repository
```bash
git clone https://github.com/The-Zen-Story/CapsulaAI.git
cd CapsulaAI
```

### 2. Configure Environment
The application needs API keys to function. 
You have two options:

**Option A: Environment File (Recommended for Servers)**
Create an `.env` file in the `orchestrator/` directory:
```bash
# orchestrator/.env
LOCAL_MODEL_ENDPOINT="https://api.minimax.io/v1"
LOCAL_MODEL_NAME="MiniMax-M2.5"
LOCAL_API_KEY="your_minimax_api_key"

LOCAL_VISION_MODEL_ENDPOINT="https://api.moonshot.ai/v1"
LOCAL_VISION_MODEL_NAME="kimi-k2.5"
LOCAL_VISION_API_KEY="your_moonshot_api_key"

CLOUD_MODEL_ENDPOINT="https://api.minimax.io/v1"
CLOUD_MODEL_NAME="MiniMax-M2.5"
CLOUD_API_KEY="your_minimax_api_key"
```

**Option B: Setup via UI (Recommended for Local Use)**
If you leave the `.env` keys empty, the system will start but AI features will fail.
You can then open the Web UI Settings page (`http://localhost:5173/settings`) and enter your keys there. These will be saved locally in `orchestrator/data/settings.json`, which is persisted by Docker application data volume.

### 3. Start the Application
Run the following command in the project root:

```bash
docker compose up --build -d
```

This will start 4 containers:
- `capsula_web`: Frontend (Port 5173)
- `capsula_orchestrator`: Backend API (Port 3000)
- `capsula_db`: Postgres Database (Port 5432)
- `capsula_minio`: Object Storage (Port 9000/9001)

### 4. Access the App
Open your browser and navigate to:
[http://localhost:5173](http://localhost:5173)

### 5. Managing the Deployment

**Stop Services:**
```bash
docker compose down
```

**View Logs:**
```bash
docker compose logs -f
```

**Update Application:**
```bash
git pull
docker compose up --build -d
```

## Data Persistence
- Database data is stored in the `postgres_data` docker volume.
- File uploads are stored in the `minio_data` docker volume.
- User settings are stored in the local bind mount `./orchestrator/data`.

To reset the database entirely:
```bash
docker compose down -v
```
(Warning: This deletes all data!)
