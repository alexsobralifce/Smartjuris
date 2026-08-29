import { Router } from 'express';
import { db } from '../db/client.js';
import { andamentos, processos } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { tenantScope, tenantScopeEscritorioId } from '../middlewares/tenantGuard.js';
import { deepseekClient, modeloPorTier, opcoesQwen, ehErroRetryableParaFallback } from '../services/ai.js';
import { trackTokenUsage, checkTokenQuota } from '../services/usage.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { parseBody, formatZodError, andamentoSchema, uuidSchema } from '../validation/schemas.js';
import { aiRateLimiter } from '../middlewares/rateLimit.js';
import { recordAudit } from '../middlewares/audit.js';
import { redactPII } from '../services/pii.js';
import { decidirTrava } from '../services/travaAssinatura.js';

const router = Router();

// Listar andamentos de um processo
router.get('/processo/:processoId', async (req, res) => {
  try {
    const { processoId } = req.params;
    if (!uuidSchema.safeParse(processoId).success) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }
    const list = await db.select().from(andamentos)
      .where(and(tenantScope(req, andamentos), eq(andamentos.processoId, processoId)))
      .orderBy(desc(andamentos.data));
    res.json(list);
  } catch (error) {
    console.error('Error fetching andamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar andamentos.' });
  }
});

// Adicionar novo andamento e gerar resumo de IA se for intimação
router.post('/', aiRateLimiter, async (req, res) => {
  try {
    const parsed = parseBody(andamentoSchema, req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { processoId, tipo, descricao, prazoFatal } = parsed.data;

    if (!uuidSchema.safeParse(processoId).success) {
      return res.status(400).json({ error: 'Identificador de processo inválido.' });
    }

    const escritorioId = tenantScopeEscritorioId(req);
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }

    // O processo deve pertencer ao mesmo escritório do usuário autenticado
    const [processo] = await db.select({ escritorioId: processos.escritorioId }).from(processos).where(eq(processos.id, processoId)).limit(1);
    if (!processo || processo.escritorioId !== escritorioId) {
      return res.status(403).json({ error: 'Processo não pertence ao seu escritório.' });
    }

    let resumoIA = '';
    if (tipo === 'Intimação' || tipo === 'Despacho') {
      // Check subscription first — bloqueia o resumo de IA para escritórios
      // self-service NÃO assinantes, mas NÃO bloqueia o registro manual do andamento.
      const trava = await decidirTrava(escritorioId);
      if (!trava.liberado && trava.aplica) {
        resumoIA = '🤖 Resumo IA: Recurso disponível apenas para assinantes. Assine um plano para desbloquear.';
      } else {
        // Cota de tokens do modo demo: bloqueado pula o resumo de IA,
        // mas NÃO bloqueia o registro manual do andamento.
        const quota = await checkTokenQuota(req as AuthenticatedRequest);
        if (quota.status === 'blocked') {
          resumoIA = '🤖 Resumo IA: Limite de tokens do modo demonstração atingido. Resumo de IA não gerado neste mês.';
        } else {
        try {
          // Redact PII before sending to the LLM (descricao original continues stored in DB)
          const safeDescricao = redactPII(descricao);
          const prompt = `Você é um assistente jurídico sênior. Resuma a seguinte intimação/despacho em 2 frases curtas, destacando a AÇÃO RECOMENDADA ao advogado e o prazo fatal:\n\n${safeDescricao}`;
          let completion: any;
          let modelUsado = modeloPorTier('FLASH');
          try {
            completion = await deepseekClient.chat.completions.create({ model: modelUsado, ...opcoesQwen(modelUsado), messages: [{ role: 'user', content: prompt }], temperature: 0.2 });
          } catch (err: any) {
            // Só reexecuta em Pro para falhas RETRYABLE (429/5xx/rede). Erros
            // de cliente (400/401/403/408) e abort NÃO repetem no tier Pro.
            if (!ehErroRetryableParaFallback(err)) throw err;
            console.warn('[Andamentos] Modelo padrão falhou, tentando Pro:', err?.message);
            modelUsado = modeloPorTier('PRO');
            completion = await deepseekClient.chat.completions.create({ model: modelUsado, ...opcoesQwen(modelUsado), messages: [{ role: 'user', content: prompt }], temperature: 0.2 });
          }
          resumoIA = `🤖 Resumo IA: ${completion.choices[0]?.message?.content || 'Intimação registrada.'}`;
          await trackTokenUsage((req as any).user?.id, 'resumo_andamento', completion.model ?? modelUsado, {
            prompt_tokens: (completion as any)?.usage?.prompt_tokens,
            completion_tokens: (completion as any)?.usage?.completion_tokens,
          });
        } catch (aiErr) {
            console.warn('Erro ao gerar resumo de IA:', aiErr);
            resumoIA = `🤖 Resumo IA: Intimação cadastrada. Ação recomendada: Análise dos autos para providências cabíveis.`;
          }
        }
      }
    }

    const [inserted] = await db.insert(andamentos).values({
      processoId,
      tipo,
      descricao,
      resumoIA: resumoIA || null,
      prazoFatal: prazoFatal || null,
      usuarioId: (req as any).user?.id || null,
      escritorioId,
    }).returning();

    await recordAudit(req, 'CREATE_ANDAMENTO', { alvoId: inserted.id, detalhes: { processoId, tipo, prazoFatal } });
    res.status(201).json(inserted);
  } catch (error) {
    console.error('Error creating andamento:', error);
    res.status(500).json({ error: 'Erro ao cadastrar andamento.' });
  }
});

export default router;
