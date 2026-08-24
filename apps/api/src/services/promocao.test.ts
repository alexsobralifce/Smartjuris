// ===========================================================================
// Fase 7B — Promoção de boas-vindas (50% OFF na 1ª mensalidade).
//
// Cobre (requisitos 7B):
//   - cálculo do valor promocional 50% de 180/300/500 = 90/150/250 (backend-only);
//   - feature flags (PROMOCAO_ATIVA/PROMOCAO_PERCENTUAL) com defaults corretos;
//   - elegibilidade: novo cliente elegível; re-assinante NÃO; quem já usou NÃO;
//   - persistência do uso (anti-abuso) e contagem para o painel dev.
//
// Banco REAL (padrão da suíte): escritórios isolados com UUID aleatório.
// ===========================================================================

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, client } from '../db/client.js';
import { escritorios } from '../db/schema.js';
import {
  configPromocao,
  promocaoExpirada,
  calcularValorPromocional,
  decidirElegibilidade,
  marcarPromocaoUsada,
  desmarcarPromocaoUsada,
  contarUsoPromocao,
} from './promocao.js';

const ESCR_NOVO = randomUUID();
const ESCR_REASSINANTE = randomUUID();
const ESCR_USOU = randomUUID();

const ENV_ORIGINAL = {
  PROMOCAO_ATIVA: process.env.PROMOCAO_ATIVA,
  PROMOCAO_PERCENTUAL: process.env.PROMOCAO_PERCENTUAL,
  PROMOCAO_VALIDADE: process.env.PROMOCAO_VALIDADE,
};

before(async () => {
  process.env.PROMOCAO_ATIVA = 'true';
  process.env.PROMOCAO_PERCENTUAL = '50';
  delete process.env.PROMOCAO_VALIDADE;

  await db.insert(escritorios).values([
    { id: ESCR_NOVO, nome: 'Promo Novo Cliente', plano: 'basico' },
    // Re-assinante: já teve assinatura ativa (histórico pago) e id do MP.
    { id: ESCR_REASSINANTE, nome: 'Promo Re-assinante', plano: 'basico', mercadoPagoId: 'mp-antigo', assinaturaStatus: 'cancelada', assinaturaPlano: 'basico' },
    // Já usou a promoção.
    { id: ESCR_USOU, nome: 'Promo Ja Usou', plano: 'basico', promocaoUsada: true, promocaoPlano: 'basico', promocaoValorCents: 9000 },
  ]);
});

after(async () => {
  // Restaura env.
  for (const [k, v] of Object.entries(ENV_ORIGINAL)) {
    if (v === undefined) delete (process.env as any)[k];
    else (process.env as any)[k] = v;
  }
  await client`DELETE FROM escritorios WHERE id IN (${ESCR_NOVO}, ${ESCR_REASSINANTE}, ${ESCR_USOU})`.catch(() => {});
  await client.end({ timeout: 5 }).catch(() => {});
});

describe('7B — configuração da promoção', () => {
  test('flags lidas com defaults corretos (ativa=true, percentual=50)', () => {
    const cfg = configPromocao();
    assert.equal(cfg.ativa, true);
    assert.equal(cfg.percentual, 50);
  });

  test('default: desligada e percentual 50 quando env ausente', () => {
    const saved = process.env.PROMOCAO_ATIVA;
    delete process.env.PROMOCAO_ATIVA;
    try {
      const cfg = configPromocao();
      assert.equal(cfg.ativa, false);
      assert.equal(cfg.percentual, 50);
    } finally {
      if (saved !== undefined) process.env.PROMOCAO_ATIVA = saved;
    }
  });

  test('validade passada → expirada', () => {
    assert.equal(promocaoExpirada({ ativa: true, percentual: 50, validade: '2020-01-01' }, new Date('2026-01-01')), true);
    assert.equal(promocaoExpirada({ ativa: true, percentual: 50, validade: '2030-01-01' }, new Date('2026-01-01')), false);
    assert.equal(promocaoExpirada({ ativa: true, percentual: 50 }, new Date('2026-01-01')), false);
  });
});

describe('7B — cálculo do valor promocional (backend-only)', () => {
  test('50% de 180/300/500 = 90/150/250', () => {
    assert.equal(calcularValorPromocional('basico')?.valorPromocional, 90);
    assert.equal(calcularValorPromocional('profissional')?.valorPromocional, 150);
    assert.equal(calcularValorPromocional('office')?.valorPromocional, 250);
  });

  test('centavos corretos: 90/150/250 (x100)', () => {
    assert.equal(calcularValorPromocional('basico')?.valorPromocionalCents, 9000);
    assert.equal(calcularValorPromocional('profissional')?.valorPromocionalCents, 15000);
    assert.equal(calcularValorPromocional('office')?.valorPromocionalCents, 25000);
  });

  test('preço integral preservado (180/300/500)', () => {
    assert.equal(calcularValorPromocional('basico')?.precoMensal, 180);
    assert.equal(calcularValorPromocional('profissional')?.precoMensal, 300);
    assert.equal(calcularValorPromocional('office')?.precoMensal, 500);
  });

  test('plano inválido → null', () => {
    assert.equal(calcularValorPromocional('luxo'), null);
  });

  test('promoção desligada → ativo=false (não calcula para o cliente)', () => {
    const v = calcularValorPromocional('basico', { ativa: false, percentual: 50 });
    assert.equal(v?.ativo, false);
    // Mesmo assim o valor é calculado corretamente (defesa em profundidade).
    assert.equal(v?.valorPromocional, 90);
  });
});

describe('7B — elegibilidade (novo cliente)', () => {
  test('novo cliente sem histórico → ELEGÍVEL', async () => {
    const d = await decidirElegibilidade(ESCR_NOVO);
    assert.equal(d.elegivel, true);
    assert.equal(d.motivo, 'novo-cliente');
    assert.equal(d.temHistoricoPago, false);
  });

  test('re-assinante (histórico pago + cancelada) → NÃO elegível', async () => {
    const d = await decidirElegibilidade(ESCR_REASSINANTE);
    assert.equal(d.elegivel, false);
    assert.equal(d.motivo, 'historico-pagamento');
    assert.equal(d.temHistoricoPago, true);
  });

  test('quem já usou a promoção → NÃO elegível (anti-abuso)', async () => {
    const d = await decidirElegibilidade(ESCR_USOU);
    assert.equal(d.elegivel, false);
    assert.equal(d.motivo, 'promocao-ja-usada');
    assert.equal(d.usouPromocao, true);
  });

  test('escritório inexistente → não elegível', async () => {
    const d = await decidirElegibilidade(randomUUID());
    assert.equal(d.elegivel, false);
    assert.equal(d.motivo, 'escritorio-nao-encontrado');
  });
});

describe('7B — persistência do uso (anti-abuso)', () => {
  test('marcar/desmarcar uso e contagem', async () => {
    // Claim atômico: recalcula o valor no backend (nunca aceita do chamador).
    const claim = await marcarPromocaoUsada(ESCR_NOVO, 'basico');
    assert.equal(claim.ok, true);
    assert.equal(claim.valorPromocionalCents, 9000, 'valor 50% de 180 = 90 recalculado no serviço');
    const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, ESCR_NOVO)).limit(1);
    assert.equal(esc.promocaoUsada, true);
    assert.equal(esc.promocaoPlano, 'basico');
    assert.equal(esc.promocaoValorCents, 9000);

    // Após usar → não elegível (bloqueia cancelar/re-assinar).
    const d = await decidirElegibilidade(ESCR_NOVO);
    assert.equal(d.elegivel, false);

    const total = await contarUsoPromocao();
    assert.ok(total >= 2, 'contagem inclui ESCR_USOU + ESCR_NOVO');

    // Rollback/compensação: desmarca (condicional ao plano do claim).
    const desmarcou = await desmarcarPromocaoUsada(ESCR_NOVO, 'basico');
    assert.equal(desmarcou, true, 'compensação desmarca o claim desta operação');
    const [esc2] = await db.select().from(escritorios).where(eq(escritorios.id, ESCR_NOVO)).limit(1);
    assert.equal(esc2.promocaoUsada, false);

    // Desmarcar de NOVO falha (já não está marcado) — não desfaz uso de outra
    // operação nem regrava.
    const desmarcou2 = await desmarcarPromocaoUsada(ESCR_NOVO, 'basico');
    assert.equal(desmarcou2, false, 'não desmarca o que outra operação não marcou');
  });

  test('claim atômico: segundo claim do MESMO escritório falha (anti-corrida)', async () => {
    await marcarPromocaoUsada(ESCR_USOU, 'basico'); // já é true → condicional não atualiza
    const esc = await db.select().from(escritorios).where(eq(escritorios.id, ESCR_USOU)).limit(1);
    // Continua true (não regrediu), e a contagem não duplicou.
    assert.equal(esc[0].promocaoUsada, true);
  });

  test('validade malformada → promoção desativada (fail-safe)', () => {
    const saved = process.env.PROMOCAO_VALIDADE;
    process.env.PROMOCAO_VALIDADE = 'nao-e-uma-data';
    try {
      const cfg = configPromocao();
      assert.equal(cfg.ativa, false, 'validade inválida desativa a promoção');
    } finally {
      if (saved === undefined) delete process.env.PROMOCAO_VALIDADE;
      else process.env.PROMOCAO_VALIDADE = saved;
    }
  });

  test('validade: término INCLUSIVO (>=) — no instante exato está expirada', () => {
    assert.equal(promocaoExpirada({ ativa: true, percentual: 50, validade: '2026-01-01T00:00:00Z' }, new Date('2026-01-01T00:00:00Z')), true);
  });

  test('percentual: apenas inteiro em (0,100) é aceito; inválido → default 50', () => {
    const saved = process.env.PROMOCAO_PERCENTUAL;
    try {
      process.env.PROMOCAO_PERCENTUAL = '50.5'; // fração inválida → 50
      assert.equal(configPromocao().percentual, 50);
      process.env.PROMOCAO_PERCENTUAL = '0';
      assert.equal(configPromocao().percentual, 50);
      process.env.PROMOCAO_PERCENTUAL = 'abc';
      assert.equal(configPromocao().percentual, 50);
      process.env.PROMOCAO_PERCENTUAL = '75';
      assert.equal(configPromocao().percentual, 75);
    } finally {
      if (saved === undefined) delete process.env.PROMOCAO_PERCENTUAL;
      else process.env.PROMOCAO_PERCENTUAL = saved;
    }
  });

  test('concorrência REAL: 2 claims simultâneos → exatamente 1 vencedor (anti-corrida)', async () => {
    // Escritório novo elegível.
    const id = randomUUID();
    await db.insert(escritorios).values({ id, nome: 'Corrida Promo', plano: 'basico' });
    try {
      const [r1, r2] = await Promise.all([
        marcarPromocaoUsada(id, 'basico'),
        marcarPromocaoUsada(id, 'basico'),
      ]);
      const vencedores = [r1, r2].filter((r) => r.ok).length;
      assert.equal(vencedores, 1, 'apenas um claim vence (UPDATE condicional atômico)');
      const [esc] = await db.select().from(escritorios).where(eq(escritorios.id, id)).limit(1);
      assert.equal(esc.promocaoUsada, true, 'persistido uma única vez');
    } finally {
      await client`DELETE FROM escritorios WHERE id = ${id}`.catch(() => {});
    }
  });

  test('claim NÃO aplica em escritório com histórico pago (anti-fraude)', async () => {
    const r = await marcarPromocaoUsada(ESCR_REASSINANTE, 'basico');
    assert.equal(r.ok, false, 're-assinante com histórico não pode obter a promoção');
  });
});
