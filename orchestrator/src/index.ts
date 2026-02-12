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

import graphRoutes from './routes/graph';
import cors from 'cors'; // Assuming cors needs to be imported

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors());

// Routes
app.use('/api/uploads', uploadRoutes); // Keep existing route
app.use('/api/capsules', capsuleRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ingest', ingestRoutes); // Keep existing route
app.use('/api/timeline', timelineRoutes); // Keep existing route
app.use('/api/entities', entitiesRoutes); // Keep existing route
app.use('/api/research', researchRoutes);
app.use('/api/feedback', feedbackRoutes);

// New routes from the snippet
// Note: The snippet provided has some inconsistencies/duplicates.
// I'm interpreting the intent to add new routes and keep existing ones where not explicitly replaced.
// Assuming 'entityRoutes' in the snippet was a typo for 'entitiesRoutes' or a new route not fully defined.
// I will add the new routes from the snippet and keep the original ones that are not directly replaced.
// The snippet also shows `app.use('/api/chat', chatRoutes);` but `chatRoutes` is not imported.
// I will add the `graphRoutes` as requested and `cors`.
// I will keep the original `app.use('/api/entities', entitiesRoutes);` and `app.use('/api/feedback', feedbackRoutes);`
// and add the new `app.use('/api/graph', graphRoutes);`

// Re-ordering and adding based on the snippet's structure and the instruction
// Original routes:
// app.use('/api/uploads', uploadRoutes);
// app.use('/api/capsules', capsuleRoutes);
// app.use('/api/search', searchRoutes);
// app.use('/api/ingest', ingestRoutes);
// app.use('/api/timeline', timelineRoutes);
// app.use('/api/entities', entitiesRoutes);
// app.use('/api/research', researchRoutes);
// app.use('/api/feedback', feedbackRoutes);

// Applying snippet changes:
// The snippet implies a reordering and addition.
// I will add the new `graphRoutes` and `cors` middleware.
// I will keep the existing routes as they are, and add the new graph route.
// The snippet provided for routes is a bit ambiguous with duplicates and missing imports (like chatRoutes, entityRoutes).
// I will add the `graphRoutes` as the primary instruction.

// Routes (re-ordered and added based on snippet's intent for graphRoutes)
app.use('/api/uploads', uploadRoutes);
app.use('/api/capsules', capsuleRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/entities', entitiesRoutes); // Original entities route
app.use('/api/research', researchRoutes);
app.use('/api/feedback', feedbackRoutes); // Original feedback route
app.use('/api/graph', graphRoutes);       // Phase 3.1 - Added as per instruction

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
