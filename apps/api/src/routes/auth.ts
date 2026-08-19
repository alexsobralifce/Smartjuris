import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';
import { usuarios, logins } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const router = Router();
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Busca usuário no banco
    const [user] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
    
    if (!user) {
      await db.insert(logins).values({
        usuarioId: null,
        emailTentado: email,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        sucesso: false,
        motivoFalha: 'Credenciais inválidas',
      });
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Compara senha criptografada
    const isValid = await bcrypt.compare(password, user.senha);
    if (!isValid) {
      await db.insert(logins).values({
        usuarioId: null,
        emailTentado: email,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        sucesso: false,
        motivoFalha: 'Credenciais inválidas',
      });
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Gera token JWT real
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.nome, email: user.email }, 
      SECRET, 
      { expiresIn: '1d' }
    );

    await db.insert(logins).values({
      usuarioId: user.id,
      emailTentado: email,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      sucesso: true,
    });
    await db.update(usuarios).set({ ultimoLogin: new Date() }).where(eq(usuarios.id, user.id));

    res.json({ 
      token, 
      user: { 
        name: user.nome, 
        role: user.role, 
        email: user.email 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.post('/logout', (req, res) => {
  res.status(200).json({ message: 'Logout realizado com sucesso.' });
});

export default router;
