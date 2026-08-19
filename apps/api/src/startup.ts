import { db } from './db/client.js';
import { sql, eq } from 'drizzle-orm';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { usuarios, processos, pecas, documentos, clientes } from './db/schema.js';

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

  // Get applied migrations
  const applied = await db.execute(sql`SELECT hash FROM drizzle.__drizzle_migrations`);
  const appliedHashes = new Set((applied as any).map((r: any) => r.hash));

  for (const file of files) {
    const hash = file.replace('.sql', '');
    if (appliedHashes.has(hash)) {
      console.log(`  ✓ Already applied: ${file}`);
      continue;
    }

    const sqlContent = await readFile(join(migrationsDir, file), 'utf-8');
    
    // Execute raw statements
    await db.execute(sql.raw(sqlContent));
    await db.execute(sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${Date.now()})`);
    console.log(`  ✅ Applied: ${file}`);
  }

  console.log('✅ Migrations complete.');
}

async function runSeedIfEmpty() {
  try {
    // Skip demo seed in production to avoid exposing known credentials
    if (process.env.NODE_ENV === 'production') {
      console.log('🔒 Production mode: skipping demo seed. Create admin user manually.');
      return;
    }

    const existingUsers = await db.select().from(usuarios).limit(1);
    if (existingUsers.length > 0) {
      console.log('🌱 Database already seeded.');
      return;
    }

    console.log('🌱 Database is empty. Seeding initial demonstration data...');

    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
    const userPassword = process.env.SEED_USER_PASSWORD || 'user123';
    console.log(`🔑 Dev seed passwords -> admin@smartjuris.com: ${adminPassword} | aline@smartjuris.com / carlos@smartjuris.com: ${userPassword}`);

    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    const hashedUserPassword = await bcrypt.hash(userPassword, 10);

    const [adminUser, normalUser1, normalUser2] = await db.insert(usuarios).values([
      {
        nome: 'Dr. Marcos Costa',
        email: 'admin@smartjuris.com',
        senha: hashedAdminPassword,
        role: 'admin',
      },
      {
        nome: 'Dra. Aline Mendes',
        email: 'aline@smartjuris.com',
        senha: hashedUserPassword,
        role: 'user',
      },
      {
        nome: 'Dr. Carlos Eduardo',
        email: 'carlos@smartjuris.com',
        senha: hashedUserPassword,
        role: 'user',
      }
    ]).returning({ id: usuarios.id, nome: usuarios.nome });

    await db.insert(clientes).values([
      {
        tipo: 'PF',
        nome: 'Fernanda Oliveira',
        cpfCnpj: '321.654.987-00',
        email: 'fernanda.oliveira@email.com',
        telefone: '(11) 98765-4321',
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        numero: '100',
        complemento: 'Apto 42',
        bairro: 'Sé',
        cidade: 'São Paulo',
        uf: 'SP',
        qualificacao: 'brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 321.654.987-00, residente e domiciliada na Praça da Sé, nº 100, Sé, São Paulo/SP, CEP 01001-000'
      },
      {
        tipo: 'PF',
        nome: 'Roberto Souza',
        cpfCnpj: '123.456.789-11',
        email: 'roberto.souza@email.com',
        telefone: '(11) 97654-3210',
        cep: '04001-000',
        logradouro: 'Rua Vergueiro',
        numero: '500',
        complemento: 'Bloco B',
        bairro: 'Vila Mariana',
        cidade: 'São Paulo',
        uf: 'SP',
        qualificacao: 'brasileiro, casado, engenheiro civil, inscrito no CPF sob o nº 123.456.789-11, residente e domiciliado na Rua Vergueiro, nº 500, Vila Mariana, São Paulo/SP, CEP 04001-000'
      },
      {
        tipo: 'PJ',
        nome: 'Construtora Alfa',
        cpfCnpj: '12.345.678/0001-99',
        email: 'contato@construtoraalfa.com.br',
        telefone: '(11) 3344-5566',
        cep: '01310-100',
        logradouro: 'Avenida Paulista',
        numero: '1500',
        complemento: 'Conj 81',
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        uf: 'SP',
        qualificacao: 'pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 12.345.678/0001-99, com sede na Avenida Paulista, nº 1500, Conj 81, Bela Vista, São Paulo/SP, CEP 01310-100'
      },
      {
        tipo: 'PF',
        nome: 'Lúcia Ferreira',
        cpfCnpj: '456.789.012-33',
        email: 'lucia.ferreira@email.com',
        telefone: '(11) 96543-2109',
        cep: '05401-000',
        logradouro: 'Rua Teodoro Sampaio',
        numero: '800',
        complemento: 'Apto 12',
        bairro: 'Pinheiros',
        cidade: 'São Paulo',
        uf: 'SP',
        qualificacao: 'brasileira, viúva, aposentada, inscrita no CPF sob o nº 456.789.012-33, residente e domiciliada na Rua Teodoro Sampaio, nº 800, Pinheiros, São Paulo/SP, CEP 05401-000'
      }
    ]);

    const insertProcessos = await db.insert(processos).values([
      {
        tipo: 'Reclamação Trabalhista',
        cliente: 'Fernanda Oliveira',
        adverso: 'Empresa XYZ S.A.',
        vara: '3ª Vara do Trabalho de SP',
        area: 'Trabalhista',
        status: 'ativo',
        valor: 'R$ 87.500,00',
        prazo: '2026-09-15',
        advogado: adminUser.nome,
      },
      {
        tipo: 'Ação de Danos Morais',
        cliente: 'Roberto Souza',
        adverso: 'Companhia Aérea VooFácil',
        vara: '2ª Vara Cível de Guarulhos',
        area: 'Consumerista',
        status: 'ativo',
        valor: 'R$ 15.000,00',
        prazo: '2026-08-25',
        advogado: normalUser1.nome,
      },
      {
        tipo: 'Defesa Cível',
        cliente: 'Construtora Alfa',
        adverso: 'Sindicato dos Trabalhadores',
        vara: '10ª Vara Cível de SP',
        area: 'Cível',
        status: 'ativo',
        valor: 'R$ 150.000,00',
        prazo: '2026-09-01',
        advogado: adminUser.nome,
      },
      {
        tipo: 'Ação Ordinária de Cobrança',
        cliente: 'Lúcia Ferreira',
        adverso: 'Banco do Brasil S.A.',
        vara: '5ª Vara de Família de SP',
        area: 'Cível',
        status: 'arquivado',
        valor: 'R$ 42.000,00',
        prazo: '2025-11-20',
        advogado: normalUser2.nome,
      }
    ]).returning({ id: processos.id });

    await db.insert(pecas).values([
      {
        processoId: insertProcessos[0].id,
        tipo: 'Petição Inicial Trabalhista',
        area: 'Trabalhista',
        cliente: 'Fernanda Oliveira',
        status: 'revisao',
        prazo: '2026-09-10',
        modelo: 'DeepSeek Chat',
        fontes: 4,
        conteudo: `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 3ª VARA DO TRABALHO DE SÃO PAULO — SP\n\nProcesso nº 0001234-56.2026.5.02.0001\n\nFERNANDA OLIVEIRA, brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 000.000.000-00, residente e domiciliada na Rua das Flores, nº 123, São Paulo/SP, por seu advogado infra-assinado, vem, mui respeitosamente, perante Vossa Excelência, propor a presente:\n\nRECLAMAÇÃO TRABALHISTA\n\nem face de Empresa XYZ S.A., pessoa jurídica de direito privado, pelos fatos e fundamentos a seguir expostos...`
      },
      {
        processoId: insertProcessos[1].id,
        tipo: 'Petição Inicial de Danos Morais',
        area: 'Consumerista',
        cliente: 'Roberto Souza',
        status: 'aprovado',
        prazo: '2026-08-23',
        modelo: 'DeepSeek Chat',
        fontes: 2,
        conteudo: 'EXCELENTÍSSIMO JUIZ DA 2ª VARA CÍVEL DA COMARCA DE GUARULHOS - SP...'
      },
      {
        processoId: insertProcessos[2].id,
        tipo: 'Contestação Cível',
        area: 'Cível',
        cliente: 'Construtora Alfa',
        status: 'revisao',
        prazo: '2026-08-30',
        modelo: 'DeepSeek Chat',
        fontes: 3,
        conteudo: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA 10ª VARA CÍVEL DA CAPITAL...'
      }
    ]);

    await db.insert(documentos).values([
      {
        nome: 'CLT_Compilada_2024.pdf',
        colecao: 'Legislação Federal',
        tamanho: '2.4 MB',
        chunks: 845
      },
      {
        nome: 'Súmulas_TST_Atualizadas.pdf',
        colecao: 'Jurisprudência',
        tamanho: '1.1 MB',
        chunks: 312
      },
      {
        nome: 'Jurisprudencia_Danos_Morais_Aereo.pdf',
        colecao: 'Jurisprudência',
        tamanho: '850 KB',
        chunks: 95
      }
    ]);

    console.log('✅ Demonstration seed completed successfully!');
  } catch (seedErr) {
    console.error('⚠️ Seed warning:', seedErr);
  }
}

async function ensureRootUser() {
  try {
    const existingRoot = await db.select().from(usuarios).where(eq(usuarios.role, 'root')).limit(1);
    if (existingRoot.length > 0) {
      return;
    }
    const rootEmail = process.env.ROOT_EMAIL || 'root@smartjuris.com';
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
    });
    console.log(`👑 Root user created: ${rootEmail}`);
  } catch (e) {
    console.error('⚠️ Error ensuring root user:', e);
  }
}

async function start() {
  await runMigrations();
  await ensureRootUser();
  await runSeedIfEmpty();
  console.log('🚀 Starting server...');
  await import('./server.js');
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
