import { db, client } from './db/client.js';
import { sql, eq } from 'drizzle-orm';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { usuarios } from './db/schema.js';
import { ensureDemoDataset } from './services/demoSeed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function generateRandomPassword(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

async function runMigrations() {
  console.log('🔄 Running migrations...');
  
  // Enable pgvector extension
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
  
  // Drizzle migrations table
  await db.execute(sql`
    CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);

  // Try candidate directories
  const candidateDirs = [
    join(__dirname, 'db', 'migrations'),
    join(__dirname, '..', 'src', 'db', 'migrations'),
    join(process.cwd(), 'apps', 'api', 'src', 'db', 'migrations'),
    join(process.cwd(), 'src', 'db', 'migrations'),
  ];

  let migrationsDir = '';
  for (const dir of candidateDirs) {
    if (existsSync(dir)) {
      migrationsDir = dir;
      break;
    }
  }

  if (!migrationsDir) {
    console.log('⚠️ No migrations directory found in candidate paths:', candidateDirs);
    return;
  }

  console.log(`📂 Using migrations dir: ${migrationsDir}`);

  const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();

  // Idempotently add content_hash column (backward compatible with legacy filename-only records)
  await db.execute(sql`ALTER TABLE drizzle.__drizzle_migrations ADD COLUMN IF NOT EXISTS content_hash text;`);

  // Get applied migrations
  const applied = await db.execute(sql`SELECT hash, content_hash FROM drizzle.__drizzle_migrations`);
  const appliedMap = new Map<string, string | null>();
  for (const row of applied as any[]) {
    appliedMap.set(row.hash, row.content_hash ?? null);
  }

  for (const file of files) {
    const name = file.replace('.sql', '');
    const sqlContent = await readFile(join(migrationsDir, file), 'utf-8');
    const contentHash = createHash('sha256').update(sqlContent).digest('hex');
    const prior = appliedMap.get(name);

    if (prior !== undefined) {
      if (prior === contentHash) {
        console.log(`  ✓ Already applied: ${file}`);
        continue;
      }
      if (prior === null) {
        await db.execute(sql`UPDATE drizzle.__drizzle_migrations SET content_hash = ${contentHash} WHERE hash = ${name}`);
        console.log(`  ✓ Already applied (hash backfilled): ${file}`);
        continue;
      }
      console.log(`  ⚠️ ${file} was modified after being applied — skipping (manual review required).`);
      continue;
    }

    // Execute raw statements inside a transaction
    await client.begin(async (tx) => {
      await tx.unsafe(sqlContent);
      await tx`INSERT INTO drizzle.__drizzle_migrations (hash, content_hash, created_at) VALUES (${name}, ${contentHash}, ${Date.now()})`;
    });
    console.log(`  ✅ Applied: ${file}`);
  }

  console.log('✅ Migrations complete.');
}

async function runSeedIfEmpty() {
  try {
    // Skip demo seed in production to avoid exposing known credentials
    if (process.env.NODE_ENV === 'production') {
      console.log('🔒 Production mode: skipping demo seed.');
      return;
    }

    // Skip se o escritório demo já existir com >=2 usuários ativos
    // (o escritório "Escritório de Demonstração" é criado pela migration 0007).
    const demoRows = (await db.execute(sql`
      SELECT id FROM escritorios WHERE nome = 'Escritório de Demonstração' LIMIT 1
    `)) as any[];
    const demoId = demoRows[0]?.id ?? null;

    if (demoId) {
      const countRows = (await db.execute(sql`
        SELECT COUNT(*)::int AS count FROM usuarios WHERE escritorio_id = ${demoId} AND ativo = true
      `)) as any[];
      const activeUsers = Number(countRows[0]?.count ?? 0);
      if (activeUsers >= 2) {
        console.log('🌱 Demo seed já configurado (escritório demo com >=2 usuários ativos).');
        return;
      }
    }

    console.log('🌱 Garantindo escritório demo + admin + user...');

    // 1. Garantir escritório de demonstração (plano basico, limite padrão de 2 usuários)
    let demo_id = demoId;
    if (!demo_id) {
      const created = (await db.execute(sql`
        INSERT INTO escritorios (nome, plano, is_demo, limite_tokens_mes)
        VALUES ('Escritório de Demonstração', 'basico', true, 10000) RETURNING id
      `)) as any[];
      demo_id = created[0]?.id ?? null;
    } else {
      // Base existente (migration 0007/0009): garante os flags de demo de forma idempotente
      await db.execute(sql`
        UPDATE escritorios SET is_demo = true, limite_tokens_mes = 10000 WHERE id = ${demo_id}
      `);
    }
    if (!demo_id) {
      console.error('⚠️ Seed: não foi possível garantir o escritório de demonstração.');
      return;
    }

    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
    const userPassword = process.env.SEED_USER_PASSWORD || 'user123';
    console.log(`🔑 Dev seed passwords -> admin@smartjuris.com: ${adminPassword} | user@smartjuris.com: ${userPassword}`);

    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    const hashedUserPassword = await bcrypt.hash(userPassword, 10);

    // 2. Admin do escritório demo (admin sempre tem acesso total — sem linhas em permissoes_usuario)
    const [adminRow] = (await db.execute(sql`
      INSERT INTO usuarios (nome, email, senha, role, ativo, escritorio_id, precisa_trocar_senha)
      VALUES ('Administrador Demo', 'admin@smartjuris.com', ${hashedAdminPassword}, 'admin', true, ${demo_id}, false)
      ON CONFLICT (email) DO UPDATE SET
        role = 'admin',
        senha = EXCLUDED.senha,
        ativo = true,
        escritorio_id = EXCLUDED.escritorio_id,
        precisa_trocar_senha = false
      RETURNING id
    `)) as any[];
    const adminUserId = adminRow?.id ?? null;

    // 3. User comum + permissões default (processos, clientes, pecas, validacao, jurimetria, contratos, documentacao)
    const [userRow] = (await db.execute(sql`
      INSERT INTO usuarios (nome, email, senha, role, ativo, escritorio_id, precisa_trocar_senha)
      VALUES ('Usuário Demo', 'user@smartjuris.com', ${hashedUserPassword}, 'user', true, ${demo_id}, false)
      ON CONFLICT (email) DO UPDATE SET
        role = 'user',
        senha = EXCLUDED.senha,
        ativo = true,
        escritorio_id = EXCLUDED.escritorio_id,
        precisa_trocar_senha = false
      RETURNING id
    `)) as any[];
    const demoUserId = userRow?.id ?? null;

    if (demoUserId) {
      await db.execute(sql`
        INSERT INTO permissoes_usuario (usuario_id, modulo, ativo)
        SELECT ${demoUserId}, m, true
        FROM unnest(ARRAY['processos','clientes','pecas','validacao','jurimetria','contratos','documentacao']) AS m
        ON CONFLICT (usuario_id, modulo) DO NOTHING
      `);
    }

    // 4. Atribuir registros existentes sem escritorio_id ao escritório demo
    await db.execute(sql`UPDATE processos SET escritorio_id = ${demo_id} WHERE escritorio_id IS NULL;`);
    await db.execute(sql`UPDATE pecas SET escritorio_id = ${demo_id} WHERE escritorio_id IS NULL;`);
    await db.execute(sql`UPDATE clientes SET escritorio_id = ${demo_id} WHERE escritorio_id IS NULL;`);
    await db.execute(sql`UPDATE andamentos SET escritorio_id = ${demo_id} WHERE escritorio_id IS NULL;`);
    await db.execute(sql`UPDATE lancamentos_financeiros SET escritorio_id = ${demo_id} WHERE escritorio_id IS NULL;`);
    await db.execute(sql`UPDATE timesheet SET escritorio_id = ${demo_id} WHERE escritorio_id IS NULL;`);

    // 5. Criar dataset demo caso não exista (ex.: banco novo ou seed parcial)
    const procCountRows = (await db.execute(sql`SELECT COUNT(*)::int AS count FROM processos`)) as any[];
    const procCount = Number(procCountRows[0]?.count ?? 0);
    if (procCount === 0) {
      await ensureDemoDataset(demo_id, adminUserId);
    }

    console.log('✅ Demo seed (escritório + admin + user) atualizado.');
  } catch (seedErr) {
    console.error('⚠️ Seed warning:', seedErr);
  }
}


async function ensureRootUser() {
  try {
    const rootEmail = process.env.ROOT_EMAIL || 'alexandresobral2004@gmail.com';
    
    // 1. Se já existe usuário com este e-mail, garante que é root e está ativo
    const [existingByEmail] = await db.select().from(usuarios).where(eq(usuarios.email, rootEmail)).limit(1);
    if (existingByEmail) {
      if (existingByEmail.role !== 'root' || !existingByEmail.ativo || !existingByEmail.emailVerificado) {
        await db.update(usuarios).set({
          role: 'root',
          ativo: true,
          emailVerificado: true,
        }).where(eq(usuarios.id, existingByEmail.id));
        console.log(`👑 Usuário ${rootEmail} promovido para Root e ativado.`);
      }
      return;
    }

    // 2. Se existe outro usuário com role 'root' mas outro e-mail, atualiza para rootEmail
    const existingRoots = await db.select().from(usuarios).where(eq(usuarios.role, 'root'));
    if (existingRoots.length > 0) {
      const root = existingRoots[0];
      await db.update(usuarios).set({
        email: rootEmail,
        ativo: true,
        emailVerificado: true,
      }).where(eq(usuarios.id, root.id));
      console.log(`👑 Root user email updated to: ${rootEmail}`);
      return;
    }

    // 3. Caso não exista nenhum root, cria um novo
    const configuredRootPassword = process.env.ROOT_PASSWORD;

    let rootPassword: string;
    if (process.env.NODE_ENV === 'production') {
      if (!configuredRootPassword || configuredRootPassword.length < 12) {
        console.error('❌ ROOT_PASSWORD must be set and at least 12 characters long in production. Refusing to create a weak root user.');
        process.exit(1);
      }
      rootPassword = configuredRootPassword;
    } else if (configuredRootPassword) {
      rootPassword = configuredRootPassword;
    } else {
      rootPassword = generateRandomPassword(16);
      console.log(`🔑 ROOT_PASSWORD not set. Generated temporary root password: ${rootPassword}`);
    }

    const hashed = await bcrypt.hash(rootPassword, 12);
    await db.insert(usuarios).values({
      nome: 'Root Administrator',
      email: rootEmail,
      senha: hashed,
      role: 'root',
      ativo: true,
      emailVerificado: true,
    });
    console.log(`👑 Root user created: ${rootEmail}`);
  } catch (e) {
    console.error('⚠️ Error ensuring root user:', e);
  }
}

/**
 * Garante um usuário root de acesso com e-mail próprio, independente do ROOT_EMAIL
 * da plataforma. Pensado para permitir login com root@smartjuris.com (o padrão da
 * variável ROOT_AUTH_EMAIL) usando a senha de ROOT_AUTH_PASSWORD.
 *
 * - Se o usuário já existe: garante role='root', ativo, emailVerificado e
 *   SINCRONIZA a senha com ROOT_AUTH_PASSWORD (caso definida) — resolvendo o caso
 *   em que a senha ficou "presa" na criação e não era atualizada por ensureRootUser.
 * - Se não existe: cria com a senha fornecida (ou gera uma temporária).
 *
 * Idempotente e seguro: roda a cada startup.
 */
async function ensureRootAuthUser() {
  try {
    const rootAuthEmail = process.env.ROOT_AUTH_EMAIL || 'root@smartjuris.com';
    const configuredPassword = process.env.ROOT_AUTH_PASSWORD;
    const isProd = process.env.NODE_ENV === 'production';

    const [existing] = await db.select().from(usuarios).where(eq(usuarios.email, rootAuthEmail)).limit(1);

    // Determina a senha desejada (e se devemos forçar a reescrita).
    // Em produção, se não houver senha configurada, não sobrescrevemos a existente
    // (apenas garante as flags); sem senha e sem usuário existente, aborta de forma
    // segura para não criar root com senha fraca.
    let rootAuthPassword: string | null = null;
    if (configuredPassword) {
      rootAuthPassword = configuredPassword;
    } else if (!existing && !isProd) {
      rootAuthPassword = generateRandomPassword(16);
      console.log(`🔑 ROOT_AUTH_PASSWORD not set. Generated temporary password for ${rootAuthEmail}: ${rootAuthPassword}`);
    }

    if (existing) {
      const updates: Record<string, unknown> = {
        role: 'root',
        ativo: true,
        emailVerificado: true,
      };
      // Sincroniza a senha apenas se houver uma senha configurada explicitamente.
      if (configuredPassword) {
        // Em produção, recusa sobrescrever com senha fraca (<12 chars).
        if (isProd && configuredPassword.length < 12) {
          console.error(`❌ ROOT_AUTH_PASSWORD for ${rootAuthEmail} must be at least 12 characters in production. Password NOT updated.`);
        } else {
          updates.senha = await bcrypt.hash(configuredPassword, 12);
        }
      }
      await db.update(usuarios).set(updates).where(eq(usuarios.id, existing.id));
      console.log(`👑 Root ${rootAuthEmail} garantido (role root/ativo).${configuredPassword && updates.senha ? ' Senha sincronizada com ROOT_AUTH_PASSWORD.' : ' Senha mantida.'}`);
      return;
    }

    // Não existe: só cria se temos uma senha segura.
    if (!rootAuthPassword) {
      if (isProd) {
        console.error('❌ ROOT_AUTH_PASSWORD must be set in production to create root@smartjuris.com. Refusing to create weak root.');
      }
      return; // não cria sem senha/config segura
    }
    if (isProd && rootAuthPassword.length < 12) {
      console.error('❌ ROOT_AUTH_PASSWORD must be at least 12 characters in production. Refusing to create weak root.');
      return;
    }
    await db.insert(usuarios).values({
      nome: 'Root de Acesso',
      email: rootAuthEmail,
      senha: await bcrypt.hash(rootAuthPassword, 12),
      role: 'root',
      ativo: true,
      emailVerificado: true,
    });
    console.log(`👑 Root ${rootAuthEmail} criado.`);
  } catch (e) {
    console.error('⚠️ Error ensuring root auth user:', e);
  }
}

async function start() {
  await runMigrations();
  await ensureRootUser();
  await ensureRootAuthUser();
  await runSeedIfEmpty();
  console.log('🚀 Starting server...');
  await import('./server.js');
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
