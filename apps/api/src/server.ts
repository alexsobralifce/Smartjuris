import './config.js';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import processosRoutes from './routes/processos.js';
import pecasRoutes from './routes/pecas.js';
import documentosRoutes from './routes/documentos.js';
import ragRoutes from './routes/rag.js';
import authRoutes from './routes/auth.js';
import jurimetriaRoutes from './routes/jurimetria.js';
import financeiroRoutes from './routes/financeiro.js';
import andamentosRoutes from './routes/andamentos.js';
import clientesRoutes from './routes/clientes.js';
import escritorioRoutes from './routes/escritorios.js';
import adminEscritorioRoutes from './routes/adminEscritorio.js';
import permissoesRoutes from './routes/permissoes.js';
import rootStatsRoutes from './routes/rootStats.js';
import rootCreditosRoutes from './routes/rootCreditos.js';
import jurisprudenciasRoutes from './routes/jurisprudencias.js';

import { authMiddleware } from './middlewares/auth.js';
import { requireRoot, requireAdmin } from './middlewares/roleGuard.js';
import { rejectRoot } from './middlewares/rejectRoot.js';
import { forcePasswordChange } from './middlewares/forcePasswordChange.js';
import { requireModule } from './middlewares/moduleGuard.js';
import { globalApiLimiter } from './middlewares/rateLimit.js';
import { client } from './db/client.js';

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

// Rotas — ordem importa: rotas mais específicas primeiro.
// Auth (público, mas com authMiddleware para /me e /logout)
app.use('/api/auth', authRoutes);

// Plataforma — root only
app.use('/api/root/escritorios', authMiddleware, requireRoot, escritorioRoutes);
app.use('/api/root', authMiddleware, requireRoot, rootCreditosRoutes);
app.use('/api/root', authMiddleware, requireRoot, rootStatsRoutes);

// Admin do escritório — admin role + tenant internamente + forcePasswordChange
app.use('/api/admin/escritorio', authMiddleware, requireAdmin, forcePasswordChange, adminEscritorioRoutes);
app.use('/api/admin/escritorio/permissoes', authMiddleware, requireAdmin, forcePasswordChange, permissoesRoutes);

// Negócio — root é bloqueado; forcePasswordChange; alguns precisam requireModule
app.use('/api/processos', authMiddleware, rejectRoot, forcePasswordChange, processosRoutes);
app.use('/api/pecas', authMiddleware, rejectRoot, forcePasswordChange, pecasRoutes);
app.use('/api/clientes', authMiddleware, rejectRoot, forcePasswordChange, clientesRoutes);
app.use('/api/financeiro', authMiddleware, rejectRoot, forcePasswordChange, requireModule('financeiro'), financeiroRoutes);
app.use('/api/andamentos', authMiddleware, rejectRoot, forcePasswordChange, andamentosRoutes);
app.use('/api/documentos', authMiddleware, rejectRoot, forcePasswordChange, documentosRoutes);
app.use('/api/rag', authMiddleware, rejectRoot, forcePasswordChange, requireModule('pecas'), ragRoutes);
app.use('/api/jurimetria', authMiddleware, rejectRoot, forcePasswordChange, requireModule('jurimetria'), jurimetriaRoutes);
app.use('/api/jurisprudencias', authMiddleware, rejectRoot, forcePasswordChange, jurisprudenciasRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
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
  shutdown('unhandledRejection', 1);
});
