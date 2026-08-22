# Evidência — Migration 0024 no banco aprovado do piloto (lexia_test)

Execução do runner OFICIAL de migrations (`apps/api/src/db/migrate.ts`) contra o
banco isolado do piloto (`E2E_DATABASE_URL=postgresql://lexia:lexia@localhost:5433/lexia_test`),
realizada em 2026-08-22.

## 1º run (aplicação)

```
Migration 0024_documentos_area_usuario.sql → APLICADA
```

## 2º run (idempotência)

```
applied: [] | skipped: 25  → 0024 NÃO reaplicada (idempotente)
```

## Colunas confirmadas em `documentos`

```
area        text
usuario_id  uuid
```

(confirmadas via `information_schema.columns` antes e depois do 2º run —
presentes e estáveis.)

## Fonte

- Migration: `apps/api/src/db/migrations/0024_documentos_area_usuario.sql`
- Runner: `apps/api/src/db/migrate.ts` (transação única + advisory lock +
  content_hash sha256)
- Teste automatizado equivalente em schema auxiliar: `0024: metadados
  area/usuario_id de documentos aplicam em banco LIMPO e são idempotentes`
  (`src/services/migrationClassifier.test.ts`)
