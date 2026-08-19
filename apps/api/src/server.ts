import express from 'express';
import cors from 'cors';
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

import { authMiddleware } from './middlewares/auth.js';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`🚀 API Server running on http://localhost:${port}`);
});
