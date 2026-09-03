// ===========================================================================
// Seed E2E — Usuários fictícios para teste de liberação de IA
// ===========================================================================
// Cria 3 escritórios/usuários FICTÍCIOS no banco LOCAL (lexia):
//   • cortesia@e2e.test  → escritório CORTESIA (isento_mensalidade=true)
//   • assinante@e2e.test → escritório ASSINANTE (assinatura_status='ativa')
//   • demo@e2e.test      → escritório DEMO (isDemo=true, sem cortesia/assinatura)
//
// Execução: pnpm --filter @lexia/api e2e:seed:ia
// Idempotente: usa ON CONFLICT DO NOTHING; pode rodar várias vezes.
// NUNCA roda em produção.
// ===========================================================================

import { db } from './client.js';
import { escritorios, usuarios, permissoesUsuario } from './schema.js';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { cicloAtual } from '../services/usage.js';

const SENHA = 'E2ELiberacao#2026';
// Módulos de IA que pressionam a trava `isNonSubscriber` / requireAssinaturaAtiva
// ("pecas" = Gerar Peças via /api/pecas/gerar-sse; "base" = Base RAG via
// /api/documentos; "decisoes" = Jurisprudência ao vivo via /api/jurisprudencias).
const MODULOS_IA = ['pecas', 'base', 'decisoes', 'jurimetria'];

async function upsertEscritorio(nome: string, opts: { isentoMensalidade?: boolean; assinaturaStatus?: string }): Promise<{ escId: string }> {
  const [esc] = await db.insert(escritorios).values({
    nome,
    plano: 'basico',
    isDemo: true,
    creditsAvailable: 0,
    reserveCentsUsed: 0,
    cycleMonth: cicloAtual(),
    isentoMensalidade: opts.isentoMensalidade ?? false,
    assinaturaStatus: opts.assinaturaStatus ?? 'nenhuma',
  }).onConflictDoNothing().returning({ id: escritorios.id });
  if (!esc) {
    // Já existe (rodada anterior): reusa.
    const [existing] = await db.select({ id: escritorios.id }).from(escritorios).where(eq(escritorios.nome, nome)).limit(1);
    return { escId: existing!.id };
  }
  return { escId: esc.id };
}

async function upsertUsuario(escId: string, nome: string, email: string, senha: string): Promise<string> {
  const senhaHash = await bcrypt.hash(senha, 4);
  let userId: string;
  const [existing] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
  if (existing) {
    // Atualiza role + escritório + senha (garante estado do cenário em re-seed).
    await db.update(usuarios).set({
      senha: senhaHash, escritorioId: escId, ativo: true, emailVerificado: true, role: 'user',
    }).where(eq(usuarios.id, existing.id));
    userId = existing.id;
  } else {
    userId = randomUUID();
    await db.insert(usuarios).values({
      id: userId,
      nome,
      email,
      senha: senhaHash,
      role: 'user',
      ativo: true,
      escritorioId: escId,
      emailVerificado: true,
    }).onConflictDoNothing();
  }
  // Concede as permissões dos módulos de IA (para a sidebar exibir os itens).
  for (const modulo of MODULOS_IA) {
    await db.insert(permissoesUsuario).values({
      id: randomUUID(), usuarioId: userId, modulo, ativo: true,
    }).onConflictDoNothing();
  }
  return userId;
}

async function main() {
  const cortesia = await upsertEscritorio('E2E Cortesia IA', { isentoMensalidade: true });
  await upsertUsuario(cortesia.escId, 'Cortesia E2E', 'cortesia@e2e.test', SENHA);

  const assinante = await upsertEscritorio('E2E Assinante IA', { assinaturaStatus: 'ativa' });
  await upsertUsuario(assinante.escId, 'Assinante E2E', 'assinante@e2e.test', SENHA);

  const demo = await upsertEscritorio('E2E Demo IA', {});
  await upsertUsuario(demo.escId, 'Demo E2E', 'demo@e2e.test', SENHA);

  console.log('=== SEED E2E IA CONCLUÍDO ===');
  console.log(`cortesia@e2e.test  / ${SENHA} → cortesia (isento_mensalidade=true)`);
  console.log(`assinante@e2e.test / ${SENHA} → assinante (assinatura_status=ativa)`);
  console.log(`demo@e2e.test      / ${SENHA} → demo (sem cortesia/assinatura)`);
  process.exit(0);
}

main().catch((e) => { console.error('Erro no seed:', e); process.exit(1); });
