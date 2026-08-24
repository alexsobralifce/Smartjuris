import { Router } from 'express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { eq, sql, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { escritorios, billingCheckoutOperations } from '../db/schema.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/roleGuard.js';
import { recordAudit } from '../middlewares/audit.js';
import { parseBody, formatZodError, checkoutSchema } from '../validation/schemas.js';
import {
  configPromocao,
  promocaoExpirada,
  calcularValorPromocional,
  decidirElegibilidade,
  marcarPromocaoUsada,
  desmarcarPromocaoUsada,
  type ValorPromocional,
} from '../services/promocao.js';
import {
  MP_CONFIGURADO,
  criarAssinatura,
  criarPreferencePromocional,
  obterPreferenceInitPoint,
  buscarPreferencePorReferencia,
  falhaMpIncerta,
  REFERENCIA_PROMOCIONAL_PREFIXO,
  cancelarPreapproval,
  obterInitPointPendente,
  buscarPreapprovalPorReferencia,
  adquirirOperacaoCheckout,
  liberarOperacaoCheckout,
  adquirirLockEscritorio,
  liberarLockEscritorio,
  validarWebhookSignature,
  processarWebhook,
  planoAssinatura,
  listarPlanosAssinatura,
} from '../services/billing.js';

const router = Router();

// ---------------------------------------------------------------------------
// Router PÚBLICO — rotas de billing SEM autenticação (landing page). Montado
// em server.ts ANTES do router autenticado (authMiddleware aplicado em
// /api/billing no server.ts bloqueia qualquer rota deste arquivo — por isso
// este router é exportado separadamente e montado em /api/billing).
// Rotas deste router só casam /promocao/status; as demais fluem para o
// router autenticado.
// ---------------------------------------------------------------------------
export const billingPublicRouter = Router();

// GET /api/billing/promocao/status — status público da promoção (landing page)
billingPublicRouter.get('/promocao/status', (_req, res) => {
  const cfg = configPromocao();
  const ativa = cfg.ativa && !promocaoExpirada(cfg);

  const planos = listarPlanosAssinatura().map((p) => {
    const promo = calcularValorPromocional(p.codigo, cfg);
    return {
      codigo: p.codigo,
      precoMensal: p.precoMensal,
      valorPromocional: promo?.ativo ? promo.valorPromocional : null,
      valorPromocionalCents: promo?.ativo ? promo.valorPromocionalCents : null,
    };
  });

  res.json({
    ativa,
    percentual: cfg.percentual,
    planos,
  });
});

/** URL pública de retorno (frontend) — usada no back_url do preapproval.
 *  O Mercado Pago REJEITA back_url http:// (exige https://). Em produção a
 *  APP_URL já é https; em dev local, use um túnel https (ex.: ngrok). */
function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
}

/** URL pública da API — usada no notification_url do webhook. */
function apiUrl(): string {
  return (process.env.PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

function validarUrlMp(url: string, rotulo: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') {
      return `${rotulo} deve ser https:// (o Mercado Pago rejeita http). Atualize APP_URL/PUBLIC_API_URL ou use um túnel https (ex.: ngrok).`;
    }
    return null;
  } catch {
    return `${rotulo} inválida: ${url}`;
  }
}

// ---------------------------------------------------------------------------
// GET /api/billing/planos — catálogo de planos de assinatura (público de uso
// interno; a tela de assinatura consome este endpoint).
// ---------------------------------------------------------------------------
router.get('/planos', (_req, res) => {
  const cfg = configPromocao();
  const planos = listarPlanosAssinatura().map((p) => {
    const promo = calcularValorPromocional(p.codigo, cfg);
    return {
      codigo: p.codigo,
      precoMensal: p.precoMensal,
      creditos: p.creditos,
      rotulo: p.rotulo,
      promocao: promo?.ativo
        ? { percentual: promo.percentual, valorPromocional: promo.valorPromocional, valorPromocionalCents: promo.valorPromocionalCents }
        : null,
    };
  });
  res.json({
    planos,
    mpConfigurado: MP_CONFIGURADO,
    promocao: { ativa: cfg.ativa && !promocaoExpirada(cfg), percentual: cfg.percentual },
  });
});

// ---------------------------------------------------------------------------
// GET /api/billing/status — status da assinatura do escritório logado.
// ---------------------------------------------------------------------------
router.get('/status', async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = req.user?.escritorioId;
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
    if (!esc) {
      return res.status(404).json({ error: 'Escritório não encontrado.' });
    }
    const planoInfo = planoAssinatura(esc.plano);
    const cfgPromo = configPromocao();
    const elegibilidade = await decidirElegibilidade(escritorioId);
    const valorPromo = calcularValorPromocional(esc.plano, cfgPromo);
    res.json({
      plano: esc.plano,
      planoRotulo: planoInfo?.rotulo ?? null,
      precoMensal: planoInfo?.precoMensal ?? null,
      creditosCiclo: planoInfo?.creditos ?? null,
      creditsAvailable: esc.creditsAvailable,
      cycleMonth: esc.cycleMonth,
      ativo: esc.ativo,
      promocao: {
        ativa: cfgPromo.ativa && !promocaoExpirada(cfgPromo),
        percentual: cfgPromo.percentual,
        elegivel: elegibilidade.elegivel,
        motivoIneligibilidade: elegibilidade.elegivel ? null : elegibilidade.motivo,
        valorPromocional: valorPromo?.ativo && elegibilidade.elegivel ? valorPromocionalPreco(valorPromo) : null,
      },
      assinatura: {
        status: esc.assinaturaStatus,
        plano: esc.assinaturaPlano,
        mercadoPagoId: esc.mercadoPagoId,
        proximaCobranca: esc.assinaturaProximaCobranca ?? null,
        ultimaCobranca: esc.assinaturaUltimaCobranca ?? null,
        expiracao: esc.assinaturaExpiracao ?? null,
      },
      mpConfigurado: MP_CONFIGURADO,
    });
  } catch (error) {
    console.error('[Billing] Erro ao buscar status:', error);
    res.status(500).json({ error: 'Erro ao buscar status da assinatura.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/checkout — cria (ou recria) a assinatura no Mercado Pago
// e devolve o init_point (URL de redirecionamento do Checkout Pro).
// ---------------------------------------------------------------------------
router.post('/checkout', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = req.user?.escritorioId;
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const parsed = parseBody(checkoutSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const plano = parsed.data.plano;
    if (!planoAssinatura(plano)) {
      return res.status(400).json({ error: `Plano de assinatura inválido: ${plano}` });
    }
    if (!MP_CONFIGURADO) {
      return res.status(503).json({ error: 'Mercado Pago não configurado (MERCADO_PAGO_ACCESS_TOKEN ausente).' });
    }

    // Valida TODA a configuração (URLs https) ANTES de tocar o provedor.
    const backUrl = `${appUrl()}/?r=assinatura`;
    const notificationUrl = `${apiUrl()}/api/billing/webhook`;
    const erroUrl = validarUrlMp(backUrl, 'APP_URL') ?? validarUrlMp(notificationUrl, 'PUBLIC_API_URL');
    if (erroUrl) {
      return res.status(400).json({ error: erroUrl });
    }

    // Lease atômico POR ESCRITÓRIO (válido durante toda a operação remota):
    // impede checkout/cancelamento concorrentes do mesmo escritório. Liberado
    // em sucesso E falha (finally).
    const lockAdquirido = await adquirirLockEscritorio(escritorioId, `checkout:${req.user?.id ?? '?'}`);
    if (!lockAdquirido) {
      return res.status(409).json({
        error: 'Já existe uma operação de assinatura em andamento para este escritório. Aguarde e tente novamente.',
        code: 'ESCRITORIO_EM_OPERACAO',
      });
    }
    try {
      return await executarCheckout(req, res, { escritorioId, plano, backUrl, notificationUrl });
    } finally {
      await liberarLockEscritorio(escritorioId);
    }
  } catch (error) {
    console.error('[Billing] Erro ao criar checkout:', error);
    res.status(500).json({ error: (error as Error).message || 'Erro ao criar checkout.' });
  }
});

/**
 * Executa o checkout em 3 fases sob o lock por escritório já adquirido.
 */
async function executarCheckout(
  req: AuthenticatedRequest,
  res: Response,
  ctx: { escritorioId: string; plano: string; backUrl: string; notificationUrl: string },
): Promise<Response> {
  const { escritorioId, plano, backUrl, notificationUrl } = ctx;
    // =====================================================================
    // FASE 1 — Decisão + operação pending (transação curta, COMMIT imediato):
    // a intenção de checkout é persistida ANTES de qualquer chamada remota.
    // Se o processo cair após esta fase, a operação pending sobrevive e é
    // recuperável por retry (reconciliação por idempotencyKey).
    // =====================================================================
    const fase1 = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('smartjuris_billing_checkout_' || ${escritorioId}))`,
      );

      const [esc] = await tx.select({
        mercadoPagoId: escritorios.mercadoPagoId,
        email: escritorios.email,
        assinaturaStatus: escritorios.assinaturaStatus,
        assinaturaPlano: escritorios.assinaturaPlano,
      }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
      if (!esc) {
        return { status: 404 as const, body: { error: 'Escritório não encontrado.' } };
      }
      if (esc.assinaturaStatus === 'ativa') {
        return {
          status: 409 as const,
          body: {
            error: 'Este escritório já possui uma assinatura ativa. Cancele a assinatura atual antes de trocar de plano.',
            code: 'ASSINATURA_ATIVA',
          },
        };
      }
      // Assinatura pendente do MESMO plano: devolve o init_point real do MP
      // para o usuário RETOMAR a autorização (sem duplicidade).
      if (esc.assinaturaStatus === 'pendente' && esc.mercadoPagoId && esc.assinaturaPlano === planoAssinatura(plano)?.codigo) {
        const initPoint = await obterInitPointPendente(esc.mercadoPagoId);
        return {
          status: 200 as const,
          body: initPoint
            ? { initPoint, reutilizada: true, mercadoPagoId: esc.mercadoPagoId, plano }
            : {
                initPoint: null, reutilizada: true, mercadoPagoId: esc.mercadoPagoId, plano,
                mensagem: 'Assinatura pendente já criada — finalize o pagamento no Mercado Pago.',
              },
        };
      }

      // Outbox: recupera operação pendente/criada existente (retry) ou cria
      // nova com chave EXCLUSIVA por operação (escritorio:plano:uuid).
      const cfgOp = planoAssinatura(plano);
      const [operacaoExistente] = await tx.select({
        idempotencyKey: billingCheckoutOperations.idempotencyKey,
        estado: billingCheckoutOperations.estado,
        mercadoPagoId: billingCheckoutOperations.mercadoPagoId,
      }).from(billingCheckoutOperations)
        .where(and(
          eq(billingCheckoutOperations.escritorioId, escritorioId),
          eq(billingCheckoutOperations.plano, cfgOp?.codigo ?? plano),
          // Retry: recupera operação pending/created OU failed com resultado
          // incerto (reconciliação antes de criar novo preapproval).
          sql`(
            ${billingCheckoutOperations.estado} IN ('pending', 'created')
            OR (${billingCheckoutOperations.estado} = 'failed' AND ${billingCheckoutOperations.resultadoIncerto} = true)
          )`,
        ))
        .limit(1);
      const idempotencyKey = operacaoExistente?.idempotencyKey ?? `esc-${escritorioId}-${cfgOp?.codigo ?? plano}-${randomUUID()}`;

      if (operacaoExistente?.mercadoPagoId) {
        // Operação já criou o preapproval (efeito remoto concluído): retorna
        // sem chamar o provedor de novo.
        const initPoint = await obterInitPointPendente(operacaoExistente.mercadoPagoId);
        if (initPoint) {
          return {
            status: 200 as const,
            body: { initPoint, reutilizada: true, mercadoPagoId: operacaoExistente.mercadoPagoId, plano },
          };
        }
      } else if (operacaoExistente) {
        // Operação pendente SEM id: uma chamada anterior pode ter criado o
        // preapproval e falhado ao gravar — RECONCILIA consultando o estado
        // REAL no Mercado Pago (por external_reference) antes de decidir.
        // Recurso autorizado sem init_point ainda é VINCULADO e a operação
        // finalizada (sem nova criação); pendente devolve o init_point.
        const reconciliado = await buscarPreapprovalPorReferencia(escritorioId);
        if (reconciliado?.id) {
          const initPoint = await obterInitPointPendente(String(reconciliado.id));
          await tx.update(billingCheckoutOperations)
            .set({ estado: 'created', mercadoPagoId: String(reconciliado.id), updatedAt: new Date() })
            .where(eq(billingCheckoutOperations.idempotencyKey, operacaoExistente.idempotencyKey));
          if (initPoint) {
            return {
              status: 200 as const,
              body: { initPoint, reutilizada: true, mercadoPagoId: String(reconciliado.id), plano },
            };
          }
          // Autorizado sem init_point: vincula ao escritório e finaliza.
          await tx.update(escritorios).set({ mercadoPagoId: String(reconciliado.id) })
            .where(eq(escritorios.id, escritorioId));
          await tx.update(billingCheckoutOperations)
            .set({ estado: 'done', fase: 'done', mercadoPagoId: String(reconciliado.id), updatedAt: new Date() })
            .where(eq(billingCheckoutOperations.idempotencyKey, operacaoExistente.idempotencyKey));
          return {
            status: 200 as const,
            body: { initPoint: null, reutilizada: true, mercadoPagoId: String(reconciliado.id), plano },
          };
        }
      }

      if (!operacaoExistente) {
        // SEM operação local: antes de gerar nova idempotencyKey/chamada
        // remota, RECONCILIA com o MP — uma tentativa anterior pode ter
        // criado o preapproval (falha de gravação local / encerramento
        // inesperado). Recuperar em vez de duplicar.
        const reconciliado = await buscarPreapprovalPorReferencia(escritorioId);
        if (reconciliado?.id) {
          const initPoint = await obterInitPointPendente(String(reconciliado.id));
          const keyReconciliada = `esc-${escritorioId}-${cfgOp?.codigo ?? plano}-${reconciliado.id}`;
          await tx.insert(billingCheckoutOperations).values({
            escritorioId,
            idempotencyKey: keyReconciliada,
            plano: cfgOp?.codigo ?? plano,
            estado: 'created',
            mercadoPagoId: String(reconciliado.id),
          }).onConflictDoNothing();
          if (initPoint) {
            return {
              status: 200 as const,
              body: { initPoint, reutilizada: true, mercadoPagoId: String(reconciliado.id), plano },
            };
          }
          // Autorizado sem init_point: vincula e finaliza sem nova criação.
          await tx.update(escritorios).set({ mercadoPagoId: String(reconciliado.id) })
            .where(eq(escritorios.id, escritorioId));
          await tx.update(billingCheckoutOperations)
            .set({ estado: 'done', fase: 'done', updatedAt: new Date() })
            .where(eq(billingCheckoutOperations.idempotencyKey, keyReconciliada));
          return {
            status: 200 as const,
            body: { initPoint: null, reutilizada: true, mercadoPagoId: String(reconciliado.id), plano },
          };
        }
        await tx.insert(billingCheckoutOperations).values({
          escritorioId,
          idempotencyKey,
          plano: cfgOp?.codigo ?? plano,
          estado: 'pending',
        }).onConflictDoNothing();
      }
      // COMMIT da transação: a operação pending fica GRAVADA antes das
      // chamadas remotas (sobrevive a falhas posteriores).
      return { status: 100 as const, proseguir: true as const, esc, idempotencyKey };
    });

    if (fase1.status !== 100) {
      return res.status(fase1.status).json(fase1.body);
    }

    // =====================================================================
    // FASE 2 — Efeitos remotos FORA de transação (MP):
    // cancelar anterior (se houver) → criar novo preapproval.
    // Claim/lease atômico da operação: retries concorrentes da MESMA
    // idempotencyKey não disparam chamadas remotas simultâneas.
    // =====================================================================
    const { esc, idempotencyKey } = fase1;

    const temLease = await adquirirOperacaoCheckout(idempotencyKey, 'cancelando');
    if (!temLease) {
      return res.status(409).json({
        error: 'Este checkout já está em processamento. Aguarde e tente novamente.',
        code: 'CHECKOUT_EM_PROCESSAMENTO',
      });
    }

    // Troca de plano: cancela a assinatura anterior ANTES de criar a nova.
    // Se o cancelamento remoto falhar, NÃO cria — interrompe (evita cobranças
    // recorrentes duplicadas no MP) e pede retry. A fase é persistida: se o
    // cancelamento CONCLUIR mas a criação falhar, o retry sabe que o recurso
    // anterior já não existe (compensação).
    if (esc.mercadoPagoId) {
      try {
        await cancelarPreapproval(esc.mercadoPagoId);
        // Fase do cancelamento persistida (compensação): recurso anterior
        // cancelado no MP — retries não tentarão cancelá-lo de novo.
        await db.update(billingCheckoutOperations)
          .set({ estado: 'cancelled', updatedAt: new Date() })
          .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
      } catch (e) {
        console.error('[Billing] Falha ao cancelar assinatura anterior — checkout interrompido:', (e as Error).message);
        await db.update(billingCheckoutOperations)
          .set({ estado: 'failed', error: 'cancelamento remoto falhou: ' + (e as Error).message.slice(0, 300), updatedAt: new Date() })
          .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
        await liberarOperacaoCheckout(idempotencyKey);
        return res.status(502).json({
          error: 'Não foi possível cancelar a assinatura anterior no Mercado Pago. Tente novamente em instantes.',
          code: 'CANCELAMENTO_REMOTO_FALHOU',
        });
      }
    }

    await db.update(billingCheckoutOperations)
      .set({ fase: 'criando', updatedAt: new Date() })
      .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));

    const assinatura = await criarAssinatura({
      escritorioId,
      plano,
      payerEmail: esc.email ?? req.user?.email ?? '',
      backUrl,
      notificationUrl,
      idempotencyKey,
    }).catch(async (e: Error) => {
      // Classificação do resultado: POR PADRÃO é INCERTO (ambíguo) — 5xx, 429,
      // timeout, falha de conexão, abort ou encerramento inesperado podem ter
      // criado o preapproval no MP antes de falhar. Apenas erros 4xx
      // CONFIRMADAMENTE sem efeito (rejeição de payload pelo MP) são falha
      // definitiva. O retry de operação incerta RECONCILIA por
      // external_reference antes de gerar nova idempotencyKey.
      console.error('[Billing] Falha ao criar assinatura no MP:', e.message);
      const falhaDefinitiva = /4[0-9]{2}|invalid|bad request|unauthorized|forbidden|not found|400|401|403|404|422/i.test(e.message);
      await db.update(billingCheckoutOperations)
        .set({
          estado: 'failed',
          resultadoIncerto: !falhaDefinitiva,
          error: 'criação remota falhou: ' + e.message.slice(0, 300),
          updatedAt: new Date(),
        })
        .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
      await liberarOperacaoCheckout(idempotencyKey);
      throw e;
    });

    // =====================================================================
    // FASE 3 — Gravação do resultado (transação curta): id do preapproval no
    // outbox + vínculo no escritório.
    // NUNCA REGRIDE estado confirmado pelo webhook, mas SEMPRE vincula o novo
    // preapproval: se o webhook `authorized`/`approved` já ATIVOU o escritório
    // entre a criação remota e esta gravação, o status permanece 'ativa' MAS o
    // mercado_pago_id é atualizado para o preapproval NOVO — o cancelamento
    // posterior usa o id correto (mesmo lock por escritório do webhook).
    // =====================================================================
    await db.transaction(async (tx) => {
      await tx.update(billingCheckoutOperations)
        .set({ estado: 'created', mercadoPagoId: assinatura.id, updatedAt: new Date() })
        .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
      // 3a) Vínculo do preapproval: SEMPRE (o novo id é o correto).
      await tx.update(escritorios)
        .set({ mercadoPagoId: assinatura.id })
        .where(eq(escritorios.id, escritorioId));
      // 3b) Status/plano: condicional — não regride 'ativa' confirmada pelo
      //     webhook (o id já foi vinculado em 3a).
      await tx.update(escritorios)
        .set({
          assinaturaStatus: 'pendente',
          assinaturaPlano: planoAssinatura(plano)?.codigo ?? plano,
          assinaturaExpiracao: null,
        })
        .where(and(
          eq(escritorios.id, escritorioId),
          sql`${escritorios.assinaturaStatus} != 'ativa'`,
        ));
      await tx.update(billingCheckoutOperations)
        .set({ estado: 'done', fase: 'done', resultadoIncerto: false, processandoEm: null, updatedAt: new Date() })
        .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
    });

    await recordAudit(req, 'BILLING_CHECKOUT', {
      alvoId: escritorioId,
      detalhes: { plano, mercadoPagoId: assinatura.id },
    });
    return res.status(201).json({
      initPoint: assinatura.initPoint,
      mercadoPagoId: assinatura.id,
      plano,
    });
}

// ---------------------------------------------------------------------------
// POST /api/billing/checkout-promocional — 1ª compra avulsa com valor
// promocional (Opção C: 50% OFF na primeira mensalidade).
//
// Fluxo:
//   1. Verifica elegibilidade (novo cliente, sem histórico/uso) e a flag.
//   2. Claim ATÔMICO do uso (marcarPromocaoUsada) — persiste o uso ANTES de
//      retornar o init_point (critério 7D) e impede corrida/anti-fraude.
//   3. Cria a PREFERENCE avulsa no MP com o valor promocional calculado no
//      backend e external_reference com marcador `sj-promo:` (identificação
//      no webhook da 7E).
//   4. Em falha remota: compensa desmarcando o uso (elegibilidade restaurada).
// ===========================================================================
router.post('/checkout-promocional', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = req.user?.escritorioId;
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }
    const parsed = parseBody(checkoutSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const plano = parsed.data.plano;
    if (!planoAssinatura(plano)) {
      return res.status(400).json({ error: `Plano de assinatura inválido: ${plano}` });
    }

    // Promoção desligada/expirada → caminho promocional indisponível (o fluxo
    // normal de assinatura permanece inalterado).
    const cfgPromo = configPromocao();
    if (!cfgPromo.ativa || promocaoExpirada(cfgPromo)) {
      return res.status(400).json({ error: 'A promoção de boas-vindas não está ativa no momento.', code: 'PROMOCAO_INATIVA' });
    }
    if (!MP_CONFIGURADO) {
      return res.status(503).json({ error: 'Mercado Pago não configurado (MERCADO_PAGO_ACCESS_TOKEN ausente).' });
    }

    // Valida TODA a configuração (URLs https) ANTES de tocar o provedor.
    const backUrl = `${appUrl()}/?r=assinatura`;
    const notificationUrl = `${apiUrl()}/api/billing/webhook`;
    const erroUrl = validarUrlMp(backUrl, 'APP_URL') ?? validarUrlMp(notificationUrl, 'PUBLIC_API_URL');
    if (erroUrl) {
      return res.status(400).json({ error: erroUrl });
    }

    // Lease atômico POR ESCRITÓRIO: impede checkout promocional × checkout/
    // cancelamento concorrentes do mesmo escritório. A ELEGIBILIDADE é
    // verificada DENTRO do executar (após a reutilização de retry — um retry
    // do mesmo checkout já marcou o uso e não pode ser barrado pela
    // elegibilidade que ele mesmo satisfez na 1ª chamada).
    const lockAdquirido = await adquirirLockEscritorio(escritorioId, `checkout-promo:${req.user?.id ?? '?'}`);
    if (!lockAdquirido) {
      return res.status(409).json({
        error: 'Já existe uma operação de assinatura em andamento para este escritório. Aguarde e tente novamente.',
        code: 'ESCRITORIO_EM_OPERACAO',
      });
    }
    try {
      return await executarCheckoutPromocional(req, res, { escritorioId, plano, backUrl, notificationUrl });
    } finally {
      await liberarLockEscritorio(escritorioId);
    }
  } catch (error) {
    // Fail-closed: NUNCA expõe status/corpo do provedor ao cliente. Erros com
    // status próprio (502 do catch da FASE 2) preservam o status e a mensagem
    // sanitizada; demais erros retornam mensagem genérica.
    const status = (error as any)?.status && Number((error as any).status) >= 400 ? Number((error as any).status) : 500;
    const mensagem = status === 502 ? (error as Error).message : 'Erro ao criar checkout promocional.';
    console.error('[Billing] Erro ao criar checkout promocional:', (error as Error).message);
    res.status(status).json({ error: mensagem });
  }
});

/**
 * Executa o checkout promocional sob o lock por escritório já adquirido:
 * claim do uso → preference avulsa no MP → gravação do init_point.
 *
 * Robustez (revisor 7D):
 *   - persistência do outbox OBRIGATÓRIA (sem sucesso se a gravação falhar);
 *   - falha AMBÍGUA do provedor (timeout/5xx) NÃO desmarca o uso — o retry
 *     reconcilia por external_reference (nunca duplica o benefício);
 *   - falha DEFINITIVA (4xx) desmarca (elegibilidade restaurada);
 *   - erros fail-closed (nunca expõem detalhes do provedor);
 *   - id/init_point da resposta validados antes do 201.
 *
 * Idempotência/retry: a idempotencyKey é ESTÁVEL por (escritório, plano) e a
 * preference criada é persistida no outbox (billingCheckoutOperations). Um
 * segundo clique devolve o init_point da preference pendente (reutilização)
 * em vez de criar outra.
 */
async function executarCheckoutPromocional(
  req: AuthenticatedRequest,
  res: Response,
  ctx: { escritorioId: string; plano: string; backUrl: string; notificationUrl: string },
): Promise<Response> {
  const { escritorioId, plano, backUrl, notificationUrl } = ctx;
  const cfgOp = planoAssinatura(plano);
  const idempotencyKey = `sj-promo-${escritorioId}-${cfgOp?.codigo ?? plano}`;
  const externalReference = `${REFERENCIA_PROMOCIONAL_PREFIXO}${escritorioId}`;

  // =====================================================================
  // FASE 0 — Retry/reutilização: se esta operação promocional já criou a
  // preference (efeito remoto concluído), devolve o init_point pendente sem
  // chamar o provedor de novo (o claim já foi feito na 1ª tentativa).
  // =====================================================================
  const [operacao] = await db.select({
    estado: billingCheckoutOperations.estado,
    resultadoIncerto: billingCheckoutOperations.resultadoIncerto,
    mercadoPagoId: billingCheckoutOperations.mercadoPagoId,
  }).from(billingCheckoutOperations)
    .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey))
    .limit(1);
  if (operacao?.mercadoPagoId && (operacao.estado === 'pending' || operacao.estado === 'created')) {
    const initPoint = await obterPreferenceInitPoint(operacao.mercadoPagoId);
    if (initPoint) {
      return res.status(200).json({
        initPoint,
        preferenceId: operacao.mercadoPagoId,
        plano,
        promocional: true,
        reutilizada: true,
      });
    }
  }

  // =====================================================================
  // FASE 0r — RECONCILIAÇÃO de operação `pending` SEM mercadoPagoId: a
  // preference pode ter sido criada remotamente e a PERSISTÊNCIA LOCAL do
  // resultado falhou (insert do created) — o efeito remoto existe mas a
  // operação local ficou sem id. Busca a preference REAL no MP:
  //   - encontrada active/pending → recupera e persiste o id (nunca duplica);
  //   - encontrada APROVADA/outros → pagamento já ocorreu no MP: NUNCA trata
  //     como ausência — bloqueia nova cobrança e preserva o claim (a 7E
  //     ativa o escritório via webhook);
  //   - busca INCONCLUSIVA (erro) → fail-closed: não prossegue nem desmarca
  //     (retry posterior reconsulta);
  //   - ausência CONFIRMADA → a preference nunca foi criada: segue o fluxo
  //     normal (claim abaixo marca/atualiza e cria a preference).
  // =====================================================================
  if (operacao?.estado === 'pending' && !operacao.mercadoPagoId) {
    const reconciliada = await buscarPreferencePorReferencia(externalReference);
    if (reconciliada.status === 'erro') {
      return res.status(502).json({
        error: 'Não foi possível confirmar o estado do pagamento no Mercado Pago. Tente novamente em instantes.',
        code: 'PROMOCAO_RECONCILIACAO_INDISPONIVEL',
      });
    }
    if (reconciliada.preference?.id) {
      const st = String(reconciliada.preference.status ?? '');
      if (st === 'active' || st === 'pending') {
        await db.update(billingCheckoutOperations)
          .set({ estado: 'created', mercadoPagoId: String(reconciliada.preference.id), updatedAt: new Date() })
          .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
        const initPoint = await obterPreferenceInitPoint(String(reconciliada.preference.id));
        if (initPoint) {
          return res.status(200).json({
            initPoint,
            preferenceId: String(reconciliada.preference.id),
            plano,
            promocional: true,
            reutilizada: true,
          });
        }
      } else {
        // Preference APROVADA/CONCLUÍDA (pagamento ocorreu): a 1ª compra
        // promocional JÁ FOI PAGA. Manter o claim e bloquear nova cobrança
        // (anti-duplicação); a ativação segue via webhook (7E).
        await db.update(billingCheckoutOperations)
          .set({ estado: 'created', mercadoPagoId: String(reconciliada.preference.id), updatedAt: new Date() })
          .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
        return res.status(409).json({
          error: 'O pagamento promocional já foi concluído. Aguarde a ativação do escritório.',
          code: 'PROMOCAO_PAGAMENTO_CONCLUIDO',
        });
      }
    } else {
      // Ausência CONFIRMADA: a preference nunca foi criada no MP. A operação
      // pending sem id significa que o efeito remoto NÃO ocorreu — desmarca o
      // uso e reabre a operação, deixando o fluxo refazer o claim limpo.
      await desmarcarPromocaoUsada(escritorioId, plano);
      await db.update(billingCheckoutOperations)
        .set({ estado: 'pending', resultadoIncerto: false, updatedAt: new Date() })
        .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
    }
  }

  // =====================================================================
  // FASE 0b — RECONCILIAÇÃO pós-falha AMBÍGUA (evidência local): a operação
  // está `failed` com `resultadoIncerto=true` (a FASE 2 gravou essa evidência
  // quando o efeito remoto era incerto). Busca a preference REAL no MP pelo
  // external_reference `sj-promo:<id>`:
  //   - existe active/pending → recupera e persiste (nunca duplica);
  //   - existe APROVADA/outros → pagamento já ocorreu: NUNCA desmarca, NUNCA
  //     recria cobrança — bloqueia (o webhook 7E ativa o escritório);
  //   - busca INCONCLUSIVA (erro) → fail-closed: NUNCA desmarca (o uso fica
  //     preservado; o retry reconsulta mais tarde);
  //   - ausência CONFIRMADA → a falha foi definitiva → desmarca o uso e
  //     segue para uma nova tentativa limpa.
  // SEM essa evidência local, `promocao_usada=true` é uso REAL concluído
  // (anti-abuso 7C) — NUNCA desmarca.
  // =====================================================================
  if (operacao?.estado === 'failed' && operacao.resultadoIncerto === true) {
    const reconciliada = await buscarPreferencePorReferencia(externalReference);
    if (reconciliada.status === 'erro') {
      // Busca inconclusiva ≠ ausência: NÃO desmarca (evita duplicação de
      // benefício). Retry posterior reconsulta.
      return res.status(502).json({
        error: 'Não foi possível confirmar o estado do pagamento no Mercado Pago. Tente novamente em instantes.',
        code: 'PROMOCAO_RECONCILIACAO_INDISPONIVEL',
      });
    }
    if (reconciliada.preference?.id) {
      const st = String(reconciliada.preference.status ?? '');
      if (st === 'active' || st === 'pending') {
        const initPoint = await obterPreferenceInitPoint(String(reconciliada.preference.id));
        await db.update(billingCheckoutOperations)
          .set({ estado: 'created', mercadoPagoId: String(reconciliada.preference.id), resultadoIncerto: false, updatedAt: new Date() })
          .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
        if (initPoint) {
          return res.status(200).json({
            initPoint,
            preferenceId: String(reconciliada.preference.id),
            plano,
            promocional: true,
            reutilizada: true,
          });
        }
      } else {
        // Preference APROVADA (pagamento ocorreu): bloqueia nova cobrança.
        await db.update(billingCheckoutOperations)
          .set({ estado: 'created', mercadoPagoId: String(reconciliada.preference.id), resultadoIncerto: false, updatedAt: new Date() })
          .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
        return res.status(409).json({
          error: 'O pagamento promocional já foi concluído. Aguarde a ativação do escritório.',
          code: 'PROMOCAO_PAGAMENTO_CONCLUIDO',
        });
      }
    } else {
      // Ausência CONFIRMADA + evidência de tentativa incerta → falha
      // definitiva real: restaura a elegibilidade e reabre a operação.
      await desmarcarPromocaoUsada(escritorioId, plano);
      await db.update(billingCheckoutOperations)
        .set({ estado: 'pending', resultadoIncerto: false, updatedAt: new Date() })
        .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey));
    }
  }

  // =====================================================================
  // FASE 0.5 — Elegibilidade "novo cliente" (anti-abuso): sem uso prévio,
  // sem assinatura ativa e sem histórico de pagamento. Só chega aqui quem
  // NÃO tem retry pendente (acima) — ou seja, quem ainda não marcou o uso.
  // =====================================================================
  const elegibilidade = await decidirElegibilidade(escritorioId);
  if (!elegibilidade.elegivel) {
    return res.status(409).json({
      error: 'Este escritório não é elegível à promoção de boas-vindas.',
      code: 'PROMOCAO_NAO_ELEGIVEL',
      motivo: elegibilidade.motivo,
    });
  }

  // =====================================================================
  // FASE 1 — Claim ATÔMICO do uso + persistência da INTENÇÃO (outbox) ANTES
  // de qualquer chamada remota. O UPDATE condicional só marca se o escritório
  // AINDA é elegível em todas as condições (mesmo UPDATE anti-corrida da
  // promocao.ts). O valor é RECALCULADO aqui (backend-only).
  // A gravação da operação é OBRIGATÓRIA (fail-closed): sem ela, nenhuma
  // chamada remota ocorre — o retry recupera por idempotencyKey estável.
  // =====================================================================
  const claim = await marcarPromocaoUsada(escritorioId, plano);
  if (!claim.ok) {
    return res.status(409).json({
      error: 'A promoção não pôde ser aplicada (escritório não elegível ou outra operação já a utilizou).',
      code: 'PROMOCAO_CLAIM_PERDIDO',
    });
  }
  await db.insert(billingCheckoutOperations).values({
    escritorioId,
    idempotencyKey,
    plano: cfgOp?.codigo ?? plano,
    estado: 'pending',
  }).onConflictDoNothing();

  // =====================================================================
  // FASE 2 — Preference avulsa no MP (fora de transação). Tratamento da
  // falha DISTINGUE o resultado:
  //   - DEFINITIVA (4xx/payload rejeitado): nada foi criado → desmarca o uso
  //     (elegibilidade restaurada para nova tentativa limpa);
  //   - AMBÍGUA (timeout/5xx/rede/resposta incompleta): NÃO sabemos → NÃO
  //     desmarca (evita duplicar o benefício) — o retry reconcilia na 0b.
  // =====================================================================
  const preference = await criarPreferencePromocional({
    escritorioId,
    plano,
    valorPromocionalCents: claim.valorPromocionalCents,
    payerEmail: req.user?.email ?? '',
    backUrl,
    notificationUrl,
    idempotencyKey,
  }).catch(async (e: Error) => {
    console.error('[Billing] Falha ao criar preference promocional:', e.message);
    const incerta = falhaMpIncerta(e);
    if (!incerta) {
      // Falha definitiva: o MP NÃO criou a preference → compensa o uso.
      await desmarcarPromocaoUsada(escritorioId, plano);
    }
    // Registra a operação como falha (resultado incerto se ambíguo) — o
    // retry da 0b reconcilia por external_reference. Erro SANITIZADO
    // (fail-closed: nunca expõe status/corpo do provedor ao cliente).
    await db.update(billingCheckoutOperations)
      .set({
        estado: 'failed',
        resultadoIncerto: incerta,
        error: 'criação da preference falhou (resultado ' + (incerta ? 'incerto' : 'definitivo') + ')',
        updatedAt: new Date(),
      })
      .where(eq(billingCheckoutOperations.idempotencyKey, idempotencyKey))
      .catch(() => {});
    const erro = new Error(incerta
      ? 'Não foi possível confirmar a criação do pagamento no Mercado Pago. Tente novamente em instantes.'
      : 'O Mercado Pago rejeitou o pagamento promocional. Verifique os dados e tente novamente.');
    (erro as any).status = 502;
    throw erro;
  });

  // =====================================================================
  // FASE 3 — Persistência OBRIGATÓRIA do resultado no outbox + resposta.
  // Se a gravação falhar, NÃO retorna sucesso (fail-closed): o uso segue
  // marcado e o retry da 0b RECONCILIA por external_reference.
  // =====================================================================
  await db.insert(billingCheckoutOperations).values({
    escritorioId,
    idempotencyKey,
    plano: cfgOp?.codigo ?? plano,
    estado: 'created',
    mercadoPagoId: preference.id,
  }).onConflictDoUpdate({
    target: billingCheckoutOperations.idempotencyKey,
    set: { estado: 'created', mercadoPagoId: preference.id, updatedAt: new Date() },
  });

  await recordAudit(req, 'BILLING_CHECKOUT_PROMOCIONAL', {
    alvoId: escritorioId,
    detalhes: {
      plano,
      preferenceId: preference.id,
      valorPromocionalCents: claim.valorPromocionalCents,
    },
  });
  return res.status(201).json({
    initPoint: preference.initPoint,
    preferenceId: preference.id,
    plano,
    promocional: true,
    valorPromocionalCents: claim.valorPromocionalCents,
    valorPromocional: claim.valorPromocionalCents / 100,
  });
}

// ---------------------------------------------------------------------------
// POST /api/billing/cancelar — cancela a assinatura ativa e desativa o
// escritório (cancelamento voluntário).
// ---------------------------------------------------------------------------
router.post('/cancelar', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const escritorioId = req.user?.escritorioId;
    if (!escritorioId) {
      return res.status(403).json({ error: 'Usuário sem escritório vinculado.' });
    }

    // Mesmo lock por escritório do checkout: impede cancelar × checkout
    // concorrentes do mesmo escritório (nunca cancela assinatura recém-criada
    // nem executa operações remotas simultâneas).
    const lockAdquirido = await adquirirLockEscritorio(escritorioId, `cancelar:${req.user?.id ?? '?'}`);
    if (!lockAdquirido) {
      return res.status(409).json({
        error: 'Já existe uma operação de assinatura em andamento para este escritório. Aguarde e tente novamente.',
        code: 'ESCRITORIO_EM_OPERACAO',
      });
    }
    try {
      const cancelamento = await db.transaction(async (tx) => {
        const [esc] = await tx.select({
          mercadoPagoId: escritorios.mercadoPagoId,
          assinaturaStatus: escritorios.assinaturaStatus,
        }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
        if (!esc) {
          return { status: 404 as const, body: { error: 'Escritório não encontrado.' } };
        }
        // Idempotência: cancelar uma assinatura já cancelada/nenhuma é um no-op
        // bem-sucedido (retries/duplo clique não geram erro nem efeito colateral).
        if (esc.assinaturaStatus === 'cancelada' || esc.assinaturaStatus === 'nenhuma') {
          return { status: 200 as const, body: { ok: true, idempotente: true, status: esc.assinaturaStatus } };
        }
        if (esc.mercadoPagoId) {
          // Consistência com o provedor: só confirma a desativação local se o
          // cancelamento remoto tiver sido aceito pelo Mercado Pago. Se falhar,
          // NÃO desativa localmente — retorna erro para retry (estado fica íntegro).
          try {
            await cancelarPreapproval(esc.mercadoPagoId);
          } catch (e) {
            console.error('[Billing] Falha ao cancelar no Mercado Pago — desativação local NÃO confirmada:', (e as Error).message);
            return {
              status: 502 as const,
              body: { error: 'O Mercado Pago não confirmou o cancelamento. Tente novamente em instantes.', code: 'CANCELAMENTO_REMOTO_FALHOU' },
            };
          }
        }
        await tx.update(escritorios).set({
          assinaturaStatus: 'cancelada',
          assinaturaExpiracao: new Date(),
          ativo: false,
        }).where(eq(escritorios.id, escritorioId));
        return { status: 200 as const, body: { ok: true } };
      });

      await recordAudit(req, 'BILLING_CANCELAR', { alvoId: escritorioId });
      return res.status(cancelamento.status).json(cancelamento.body);
    } finally {
      await liberarLockEscritorio(escritorioId);
    }
  } catch (error) {
    console.error('[Billing] Erro ao cancelar assinatura:', error);
    res.status(500).json({ error: 'Erro ao cancelar assinatura.' });
  }
});

/** Formato amigável do valor promocional para o frontend (status). */
function valorPromocionalPreco(v: ValorPromocional) {
  return {
    percentual: v.percentual,
    precoMensal: v.precoMensal,
    valorPromocional: v.valorPromocional,
    valorPromocionalCents: v.valorPromocionalCents,
  };
}

export default router;
