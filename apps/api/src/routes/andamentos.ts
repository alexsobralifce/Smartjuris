import { Router } from 'express';
import { db } from '../db/client.js';
import { andamentos } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { deepseekClient } from '../services/ai.js';
import { trackTokenUsage } from '../services/usage.js';

const router = Router();

// Listar andamentos de um processo
router.get('/processo/:processoId', async (req, res) => {
  try {
    const { processoId } = req.params;
    const list = await db.select().from(andamentos)
      .where(eq(andamentos.processoId, processoId))
      .orderBy(desc(andamentos.data));
    res.json(list);
  } catch (error) {
    console.error('Error fetching andamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar andamentos.' });
  }
});

// Adicionar novo andamento e gerar resumo de IA se for intimação
router.post('/', async (req, res) => {
  try {
    const { processoId, tipo, descricao, prazoFatal } = req.body;

    let resumoIA = '';
    if (tipo === 'Intimação' || tipo === 'Despacho') {
      try {
        const prompt = `Você é um assistente jurídico sênior. Resuma a seguinte intimação/despacho em 2 frases curtas, destacando a AÇÃO RECOMENDADA ao advogado e o prazo fatal:\n\n${descricao}`;
        const completion = await deepseekClient.chat.completions.create({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        });
        resumoIA = `🤖 Resumo IA: ${completion.choices[0]?.message?.content || 'Intimação registrada.'}`;
        await trackTokenUsage((req as any).user?.id, 'resumo_andamento', 'deepseek-chat', {
          prompt_tokens: (completion as any)?.usage?.prompt_tokens,
          completion_tokens: (completion as any)?.usage?.completion_tokens,
        });
      } catch (aiErr) {
        console.warn('Erro ao gerar resumo de IA:', aiErr);
        resumoIA = `🤖 Resumo IA: Intimação cadastrada. Ação recomendada: Análise dos autos para providências cabíveis.`;
      }
    }

    const [inserted] = await db.insert(andamentos).values({
      processoId,
      tipo,
      descricao,
      resumoIA: resumoIA || null,
      prazoFatal: prazoFatal || null,
      usuarioId: (req as any).user?.id || null
    }).returning();

    res.status(201).json(inserted);
  } catch (error) {
    console.error('Error creating andamento:', error);
    res.status(500).json({ error: 'Erro ao cadastrar andamento.' });
  }
});

export default router;
