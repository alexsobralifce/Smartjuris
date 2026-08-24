import { Router } from 'express';
import { validarWebhookSignature, processarWebhook } from '../services/billing.js';
import { recordAuditWebhook } from '../middlewares/audit.js';

const router = Router();

/**
 * Webhook do Mercado Pago (ASSINATURAS) — rota PÚBLICA (sem authMiddleware:
 * o Mercado Pago não envia cookie de sessão). A segurança é feita pela
 * validação da assinatura x-signature (HMAC-SHA256) e pela conferência do
 * recurso na API do MP.
 *
 * Fail-closed: assinatura inválida/ausente em produção → HTTP 401 (o MP
 * reenvia em caso de erro, o que é desejável para eventos legítimos; eventos
 * forjados não têm efeito). Em dev/teste sem secret, aceita com aviso.
 *
 * O Mercado Pago envia: { type: "payment" | "subscription_preapproval", data: { id } }
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body ?? {};
    const headers = req.headers as Record<string, string | undefined>;
    const dataId = body?.data?.id ? String(body.data.id) : '';

    const assinatura = validarWebhookSignature(headers, { id: dataId, type: body?.type });
    if (!assinatura.valido) {
      console.warn('[Billing] Webhook rejeitado:', assinatura.motivo);
      await recordAuditWebhook({
        acao: 'BILLING_WEBHOOK_REJEITADO',
        detalhes: { tipo: body?.type, dataId, motivo: assinatura.motivo },
      });
      // Fail-closed: 401 para o MP reenviar (evento legítimo) sem efeito para
      // eventos forjados.
      return res.status(401).json({ error: assinatura.motivo });
    }

    const resultado = await processarWebhook(body);
    await recordAuditWebhook({
      acao: 'BILLING_WEBHOOK',
      alvoId: resultado.handled ? (resultado.escritorioId ?? null) : null,
      detalhes: {
        tipo: body?.type,
        dataId,
        resultado: resultado.handled ? resultado.acao : resultado.motivo,
      },
    });

    res.status(200).json({ recebido: true, ...resultado });
  } catch (error) {
    console.error('[Billing] Erro no webhook:', error);
    // Erro inesperado: 500 para o MP reenviar (não perde eventos legítimos).
    res.status(500).json({ error: 'Erro interno ao processar webhook.' });
  }
});

export default router;
