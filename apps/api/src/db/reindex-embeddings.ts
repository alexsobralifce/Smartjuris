// Reindexação dos embeddings de todos os chunks com o modelo atual
// (text-embedding-3-small, 1024 dims). Necessário ao trocar de provedor de
// embeddings: vetores de modelos diferentes não são comparáveis.
//
// Uso (simulação por padrão — nada é gravado sem --apply):
//   pnpm --filter @lexia/api exec tsx src/db/reindex-embeddings.ts
//   pnpm --filter @lexia/api exec tsx src/db/reindex-embeddings.ts --apply
import { sql } from 'drizzle-orm';
import { db, client } from './client.js';
import { generateEmbedding } from '../services/embedding.js';

const apply = process.argv.includes('--apply');
const LOTE = 100;

async function main() {
  const [{ n }] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM chunks`)) as any[];
  console.log(`[reindex] chunks no banco: ${n}`);
  if (!apply) {
    console.log('[reindex] simulação: nenhum embedding foi gerado nem gravado. Use --apply para executar.');
    return;
  }

  let processados = 0;
  let falhas = 0;
  let offset = 0;
  for (;;) {
    const lote = (await db.execute(sql`
      SELECT id, texto FROM chunks ORDER BY id LIMIT ${LOTE} OFFSET ${offset}
    `)) as any[];
    if (lote.length === 0) break;
    for (const c of lote) {
      try {
        const vetor = await generateEmbedding(c.texto);
        await db.execute(sql`UPDATE chunks SET embedding = ${`[${vetor.join(',')}]`}::vector WHERE id = ${c.id}`);
        processados++;
      } catch (err: any) {
        falhas++;
        console.error(`[reindex] falha no chunk ${c.id}: ${err?.message ?? err}`);
      }
    }
    offset += lote.length;
    console.log(`[reindex] progresso: ${processados} ok, ${falhas} falhas`);
  }
  console.log(`[reindex] concluído: ${processados} ok, ${falhas} falhas`);
}

main()
  .catch((err) => {
    console.error('[reindex] erro fatal:', err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
