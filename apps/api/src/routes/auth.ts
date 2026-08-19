import { Router } from 'express';
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const router = Router();
const SECRET = process.env.JWT_SECRET || 'supersecret';

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  // Mock login: In a real app we'd query the db and check bcrypt hash
  if (email === 'admin@smartjuris.com' && password === 'admin') {
    const token = jwt.sign({ id: 1, role: 'admin', name: 'Dr. Marcos Costa' }, SECRET, { expiresIn: '1d' });
    res.json({ token, user: { name: 'Dr. Marcos Costa', role: 'Administrador' } });
  } else {
    res.status(401).json({ error: 'Credenciais inválidas' });
  }
});

router.post('/logout', (req, res) => {
  res.status(200).json({ message: 'Logout successful' });
});

export default router;
