import express from 'express';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { initMinio } from './config/minio';
import uploadRoutes from './routes/upload';
import capsuleRoutes from './routes/capsule';
import searchRoutes from './routes/search';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());

// Routes
app.use('/api/uploads', uploadRoutes);
app.use('/api/capsules', capsuleRoutes);
app.use('/api/search', searchRoutes);

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
const startServer = async () => {
  await initMinio();
  app.listen(port, () => {
    console.log(`Orchestrator running at http://localhost:${port}`);
  });
};

startServer();
