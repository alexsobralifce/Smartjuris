import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

import processosRoutes from './routes/processos';
import pecasRoutes from './routes/pecas';
import documentosRoutes from './routes/documentos';
import ragRoutes from './routes/rag';
import authRoutes from './routes/auth';
import jurimetriaRoutes from './routes/jurimetria';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/processos', processosRoutes);
app.use('/api/pecas', pecasRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/jurimetria', jurimetriaRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`🚀 API Server running on http://localhost:${port}`);
});
