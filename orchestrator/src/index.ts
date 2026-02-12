import express from 'express';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { initMinio } from './config/minio';
import uploadRoutes from './routes/upload';
import capsuleRoutes from './routes/capsule';
import searchRoutes from './routes/search';
import ingestRoutes from './routes/ingest';
import timelineRoutes from './routes/timeline';
import entitiesRoutes from './routes/entities';
import researchRoutes from './routes/research';
import feedbackRoutes from './routes/feedback';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());

// Routes
app.use('/api/uploads', uploadRoutes);
app.use('/api/capsules', capsuleRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/entities', entitiesRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/feedback', feedbackRoutes);

// Health check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// Initialize services and start server
import { LLMConfig, CapabilityTester } from './ai';
import { startWorker } from './worker';

const startServer = async () => {
  await initMinio();

  // AI Capability Check
  if (process.env.LOCAL_MODEL_ENDPOINT) {
    console.log('--- AI Startup Check ---');
    console.log('[Local] Endpoint:', process.env.LOCAL_MODEL_ENDPOINT);
  }
  if (process.env.CLOUD_MODEL_ENDPOINT) {
    console.log('[Cloud] Endpoint:', process.env.CLOUD_MODEL_ENDPOINT);
  }

  startWorker(); // Start the background worker

  app.listen(port, () => {
    console.log(`Orchestrator running at http://localhost:${port}`);
  });
};

startServer();
