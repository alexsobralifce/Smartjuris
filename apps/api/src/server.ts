import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

import processosRoutes from './routes/processos.js';
import pecasRoutes from './routes/pecas.js';
import documentosRoutes from './routes/documentos.js';
import ragRoutes from './routes/rag.js';
import authRoutes from './routes/auth.js';
import jurimetriaRoutes from './routes/jurimetria.js';
import financeiroRoutes from './routes/financeiro.js';
import andamentosRoutes from './routes/andamentos.js';
import clientesRoutes from './routes/clientes.js';
import adminRoutes from './routes/admin.js';

import { authMiddleware } from './middlewares/auth.js';
import { requireRoot } from './middlewares/roleGuard.js';
import { globalApiLimiter } from './middlewares/rateLimit.js';
import { client } from './db/client.js';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const app = express();
const port = process.env.PORT || 3001;

// Trust Railway proxy so req.ip reflects the real client IP
app.set('trust proxy', 1);

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:5173',
      'http://localhost:3001',
      'https://smartjuris-web-production.up.railway.app',
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Global rate limiter for all /api routes
app.use('/api', globalApiLimiter);

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/processos', authMiddleware, processosRoutes);
app.use('/api/pecas', authMiddleware, pecasRoutes);
app.use('/api/documentos', authMiddleware, documentosRoutes);
app.use('/api/rag', authMiddleware, ragRoutes);
app.use('/api/jurimetria', authMiddleware, jurimetriaRoutes);
app.use('/api/financeiro', authMiddleware, financeiroRoutes);
app.use('/api/andamentos', authMiddleware, andamentosRoutes);
app.use('/api/clientes', authMiddleware, clientesRoutes);
app.use('/api/admin', authMiddleware, requireRoot, adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(port, () => {
  console.log(`🚀 API Server running on http://localhost:${port}`);
});

async function shutdown(signal: string, exitCode = 0) {
  console.log(`🛑 Received ${signal}, shutting down...`);
  server.close(() => {
    console.log('HTTP server closed.');
  });
  try {
    await client.end({ timeout: 5 });
  } catch (err) {
    console.error('Error closing database client:', err);
  }
  process.exit(exitCode);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
