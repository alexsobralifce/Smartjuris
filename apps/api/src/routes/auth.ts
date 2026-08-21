import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';
import { usuarios, logins, permissoesUsuario, escritorios, codigosVerificacao } from '../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.js';
import { refreshSession } from '../middlewares/refreshSession.js';
import { loginRateLimiter, registroRateLimiter } from '../middlewares/rateLimit.js';
import { revokeToken } from '../middlewares/revocation.js';
import { recordAudit } from '../middlewares/audit.js';
import { getTokenUsageMes } from '../services/usage.js';
import { parseBody, formatZodError, registroSchema, verificarCodigoSchema, reenviarCodigoSchema, solicitarResetSenhaSchema, redefinirSenhaSchema } from '../validation/schemas.js';
import { sendVerificationCodeEmail, sendRootNewUserNotificationEmail, sendWelcomeEmail, sendPasswordResetCodeEmail } from '../services/email.js';

const router = Router();
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

const COOKIE_NAME = 'smartjuris_token';
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // `*.up.railway.app` são sites distintos (up.railway.app está no Public Suffix List),
  // então o cookie precisa de SameSite=None para ser enviado cross-origin entre web e API.
  // Em dev (localhost = same-site) mantemos Lax, pois None exige Secure (incompatível com http).
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 86400000,
  path: '/',
};

const MAX_EMAIL_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

interface EmailLockEntry {
  count: number;
  firstFailureAt: number;
  lockedUntil: number;
}

const emailLockout = new Map<string, EmailLockEntry>();

function resolveTokenFromRequest(req: AuthenticatedRequest): string | null {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function recordEmailFailure(normalizedEmail: string): void {
  const now = Date.now();
  const existing = emailLockout.get(normalizedEmail);
  if (!existing || now - existing.firstFailureAt > FAILURE_WINDOW_MS) {
    emailLockout.set(normalizedEmail, { count: 1, firstFailureAt: now, lockedUntil: 0 });
    return;
  }
  const count = existing.count + 1;
  if (count >= MAX_EMAIL_FAILURES) {
    emailLockout.set(normalizedEmail, {
      count,
      firstFailureAt: existing.firstFailureAt,
      lockedUntil: now + LOCKOUT_MS,
    });
  } else {
    emailLockout.set(normalizedEmail, { count, firstFailureAt: existing.firstFailureAt, lockedUntil: 0 });
  }
}

/**
 * Limite efetivo de créditos mensais (1 crédito = 1 token) do usuário:
 * - override individual (`usuarios.creditos_mes`) quando definido;
 * - senão, o saldo do escritório (`escritorios.limite_tokens_mes`);
 * - sem saldo definido → null (sem restrição).
 */
async function getLimiteEfetivo(userId: string | null | undefined, escritorioId: string | null | undefined): Promise<number | null> {
  if (userId) {
    const [u] = await db
      .select({ creditosMes: usuarios.creditosMes })
      .from(usuarios)
      .where(eq(usuarios.id, userId))
      .limit(1);
    if (u?.creditosMes != null) return Number(u.creditosMes);
  }
  if (!escritorioId) return null;
  const [esc] = await db
    .select({ limiteTokensMes: escritorios.limiteTokensMes })
    .from(escritorios)
    .where(eq(escritorios.id, escritorioId))
    .limit(1);
  return esc?.limiteTokensMes != null ? Number(esc.limiteTokensMes) : null;
}

router.post('/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  // Validação de entrada antes de qualquer acesso ao banco/criptografia
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  const normalizedEmail = email.toLowerCase();

  try {
    // Per-email lockout: targeted brute force on a single account
    const lockEntry = emailLockout.get(normalizedEmail);
    if (lockEntry && lockEntry.lockedUntil > Date.now()) {
      return res.status(429).json({ error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' });
    }
    if (lockEntry && lockEntry.lockedUntil <= Date.now()) {
      emailLockout.delete(normalizedEmail);
    }

    // Busca usuário no banco (normalizado para não contornar o lockout com variação de caixa)
    const [user] = await db.select().from(usuarios).where(eq(usuarios.email, normalizedEmail)).limit(1);

    if (!user) {
      recordEmailFailure(normalizedEmail);
      await db.insert(logins).values({
        usuarioId: null,
        emailTentado: email,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        sucesso: false,
        motivoFalha: 'Credenciais inválidas',
      });
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    if (user.ativo === false) {
      recordEmailFailure(normalizedEmail);
      await db.insert(logins).values({
        usuarioId: user.id,
        emailTentado: email,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        sucesso: false,
        motivoFalha: 'Usuário inativo',
      });
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Compara senha criptografada
    const isValid = await bcrypt.compare(password, user.senha);
    if (!isValid) {
      recordEmailFailure(normalizedEmail);
      await db.insert(logins).values({
        usuarioId: user.id,
        emailTentado: email,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        sucesso: false,
        motivoFalha: 'Credenciais inválidas',
      });
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Sucesso: reseta contador de bloqueio por email
    emailLockout.delete(normalizedEmail);

    // Busca dados de tenancy e flag de troca de senha do banco (valores atuais/defensivos)
    const [tenantRow] = await db
      .select({ escritorioId: usuarios.escritorioId, precisaTrocarSenha: usuarios.precisaTrocarSenha })
      .from(usuarios)
      .where(eq(usuarios.id, user.id))
      .limit(1);

    const escritorioId = tenantRow?.escritorioId ?? null;
    const precisaTrocarSenha = tenantRow?.precisaTrocarSenha ?? false;

    // Se o usuário pertence a um escritório, verifica se o escritório está ativo
    if (escritorioId) {
      const [escritorio] = await db
        .select({ ativo: escritorios.ativo })
        .from(escritorios)
        .where(eq(escritorios.id, escritorioId))
        .limit(1);
      if (!escritorio || escritorio.ativo === false) {
        await db.insert(logins).values({
          usuarioId: user.id,
          emailTentado: email,
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
          sucesso: false,
          motivoFalha: 'Escritório desativado',
        });
        return res.status(403).json({ error: 'Seu cadastro ainda não foi ativado pelo administrador da plataforma. Aguarde a habilitação do seu escritório.' });
      }
    }

    // Limite efetivo de créditos mensais (override do usuário ou saldo do escritório)
    const limiteTokensMes = await getLimiteEfetivo(user.id, escritorioId);

    // Consumo de tokens do mês (apenas quando há limite definido)
    let tokensMes = 0;
    if (limiteTokensMes != null) {
      tokensMes = await getTokenUsageMes(user.id);
    }

    // Permissões de módulo: apenas role 'user' tem permissões granulares
    let permissoes: string[] = [];
    if (user.role === 'user') {
      const permRows = await db.select({ modulo: permissoesUsuario.modulo }).from(permissoesUsuario)
        .where(and(eq(permissoesUsuario.usuarioId, user.id), eq(permissoesUsuario.ativo, true)));
      permissoes = permRows.map((r) => r.modulo);
    }

    // Gera token JWT real com jti e payload multi-tenant completo
    const jti = randomUUID();
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        name: user.nome,
        email: user.email,
        escritorioId,
        permissoes,
        precisaTrocarSenha,
        jti,
      },
      SECRET,
      { expiresIn: '1d' }
    );

    await db.insert(logins).values({
      usuarioId: user.id,
      emailTentado: email,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      sucesso: true,
    });
    await db.update(usuarios).set({ ultimoLogin: new Date() }).where(eq(usuarios.id, user.id));

    res.cookie(COOKIE_NAME, token, cookieOptions);

    res.json({
      user: {
        id: user.id,
        name: user.nome,
        role: user.role,
        email: user.email,
        escritorioId: escritorioId ?? null,
        permissoes,
        precisaTrocarSenha,
        tokensMes,
        limiteTokensMes,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.post('/registro', registroRateLimiter, async (req, res) => {
  try {
    const parsed = parseBody(registroSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { nome, email, senha, oab, oabUf, escritorioNome, cnpj, telefone } = parsed.data;

    // Checagem de usuário existente
    const [existing] = await db.select({
      id: usuarios.id,
      nome: usuarios.nome,
      emailVerificado: usuarios.emailVerificado,
    }).from(usuarios).where(eq(usuarios.email, email)).limit(1);

    if (existing) {
      if (existing.emailVerificado) {
        return res.status(409).json({ error: 'Este e-mail já está cadastrado.', code: 'EMAIL_DUPLICATE' });
      }

      const requereOtp = process.env.REQUIRE_EMAIL_OTP === 'true';

      // PADRÃO: usuário que começou o cadastro (não verificou) é dispensado de
      // código — fica marcado como verificado direto. OTP só se REQUIRE_EMAIL_OTP=true.
      if (!requereOtp) {
        const [upd] = await db.update(usuarios)
          .set({ emailVerificado: true })
          .where(eq(usuarios.email, email))
          .returning({ id: usuarios.id, nome: usuarios.nome, escritorioId: usuarios.escritorioId });
        if (upd?.escritorioId) {
          const [escritorio] = await db.select().from(escritorios)
            .where(eq(escritorios.id, upd.escritorioId)).limit(1);
          sendRootNewUserNotificationEmail({
            nome: upd.nome,
            email,
            oab: oab || 'Não informada',
            oabUf: oabUf || 'BR',
            escritorioNome: escritorio?.nome || escritorioNome,
            telefone: telefone || undefined,
            cnpj: cnpj || undefined,
          }).catch((err) => console.error('[Auth] Erro ao notificar root por e-mail:', err));
        }
        return res.status(200).json({
          success: true,
          step: 'ok',
          email,
          message: 'Cadastro finalizado! O administrador será notificado para liberar o acesso.',
        });
      }

      // Se o usuário iniciou cadastro mas não verificou o e-mail, gera um novo código OTP
      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      const expiraEm = new Date(Date.now() + 60 * 1000); // 1 minuto

      await db.update(codigosVerificacao)
        .set({ utilizado: true })
        .where(and(eq(codigosVerificacao.email, email), eq(codigosVerificacao.tipo, 'registro')));

      await db.insert(codigosVerificacao).values({
        email,
        codigo,
        tipo: 'registro',
        expiraEm,
      });

      sendVerificationCodeEmail(email, existing.nome, codigo).catch((err) => {
        console.error('[Auth] Falha no envio de código de verificação:', err);
      });

      return res.status(200).json({
        success: true,
        step: 'verificacao',
        email,
        message: 'Código de verificação enviado para o seu e-mail.',
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    // PADRÃO: a verificação de e-mail por código OTP é DISPENSADA — o usuário já
    // nasce com emailVerificado:true e o cadastro segue direto, sem pedir código.
    // Para reativar a exigência de código (futuro, com domínio de e-mail em
    // produção), defina REQUIRE_EMAIL_OTP=true na variável de ambiente.
    const requereOtp = process.env.REQUIRE_EMAIL_OTP === 'true';

    // CNPJ opcional com validação leve de formato (14 dígitos)
    if (cnpj) {
      const cnpjDigits = cnpj.replace(/\D/g, '');
      if (cnpjDigits.length !== 14) {
        return res.status(400).json({ error: 'CNPJ inválido.' });
      }
    }

    // Criação atômica do escritório (pendente de aprovação) + usuário admin
    const [esc] = await db.transaction(async (tx) => {
      const [escritorioCriado] = await tx.insert(escritorios).values({
        nome: escritorioNome,
        plano: 'basico',
        isDemo: true,
        limiteTokensMes: 10000,
        ativo: false,
        ...(cnpj ? { cnpj } : {}),
        ...(telefone ? { telefone } : {}),
      }).returning();

      await tx.insert(usuarios).values({
        nome,
        email,
        senha: senhaHash,
        role: 'admin',
        ativo: false,
        // Dispensa o OTP por padrão; só pede código se REQUIRE_EMAIL_OTP=true.
        emailVerificado: requereOtp ? false : true,
        oab,
        oabUf,
        escritorioId: escritorioCriado.id,
        precisaTrocarSenha: false,
      });

      return [escritorioCriado];
    });

    await recordAudit(req, 'REGISTRO_ESCRITORIO', {
      alvoId: esc.id,
      detalhes: { email, escritorioNome, requereOtp },
    });

    // Somente se opcionalmente exigido (REQUIRE_EMAIL_OTP=true), gera e envia o OTP.
    if (requereOtp) {
      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      const expiraEm = new Date(Date.now() + 60 * 1000); // 1 minuto

      await db.insert(codigosVerificacao).values({
        email,
        codigo,
        tipo: 'registro',
        expiraEm,
      });

      // Envio do código de 6 dígitos para o e-mail do usuário
      sendVerificationCodeEmail(email, nome, codigo).catch((err) => {
        console.error('[Auth] Falha no envio de código de verificação:', err);
      });

      return res.status(201).json({
        success: true,
        step: 'verificacao',
        email,
        message: 'Código de verificação enviado para o seu e-mail.',
      });
    }

    // Padrão: dispensa o OTP. Ainda notifica o Root (para liberação) e envia
    // boas-vindas — ambos fire-and-forget, não bloqueiam o cadastro.
    sendRootNewUserNotificationEmail({
      nome,
      email,
      oab: oab || 'Não informada',
      oabUf: oabUf || 'BR',
      escritorioNome: esc?.nome || escritorioNome,
      telefone: telefone || undefined,
      cnpj: cnpj || undefined,
    }).catch((err) => console.error('[Auth] Erro ao notificar root por e-mail:', err));

    sendWelcomeEmail(email, nome, esc?.nome || escritorioNome)
      .catch((err) => console.error('[Auth] Erro ao enviar boas-vindas:', err));

    res.status(201).json({
      success: true,
      step: 'ok',
      email,
      message: 'Cadastro realizado! O administrador será notificado para liberar o acesso.',
    });
  } catch (error) {
    console.error('Registro error:', error);
    res.status(500).json({ error: 'Erro ao realizar o cadastro.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/verificar-codigo — validação do código OTP de 6 dígitos
// ---------------------------------------------------------------------------
router.post('/verificar-codigo', async (req, res) => {
  try {
    const parsed = parseBody(verificarCodigoSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { email, codigo } = parsed.data;

    // Busca o código ativo mais recente
    const [registroCodigo] = await db.select()
      .from(codigosVerificacao)
      .where(and(
        eq(codigosVerificacao.email, email),
        eq(codigosVerificacao.tipo, 'registro'),
        eq(codigosVerificacao.utilizado, false),
      ))
      .orderBy(desc(codigosVerificacao.createdAt))
      .limit(1);

    if (!registroCodigo) {
      return res.status(400).json({ error: 'Nenhum código de verificação pendente para este e-mail.' });
    }

    if (new Date() > new Date(registroCodigo.expiraEm)) {
      return res.status(400).json({ error: 'Código de verificação expirado. Solicite um novo código.' });
    }

    if (registroCodigo.tentativas >= 5) {
      return res.status(400).json({ error: 'Número máximo de tentativas excedido. Solicite um novo código.' });
    }

    if (registroCodigo.codigo !== codigo) {
      await db.update(codigosVerificacao)
        .set({ tentativas: registroCodigo.tentativas + 1 })
        .where(eq(codigosVerificacao.id, registroCodigo.id));
      return res.status(400).json({ error: 'Código de verificação incorreto.' });
    }

    // Código válido: marca como utilizado e ativa emailVerificado
    await db.update(codigosVerificacao)
      .set({ utilizado: true })
      .where(eq(codigosVerificacao.id, registroCodigo.id));

    const [userAtualizado] = await db.update(usuarios)
      .set({ emailVerificado: true })
      .where(eq(usuarios.email, email))
      .returning();

    if (userAtualizado?.escritorioId) {
      const [escritorio] = await db.select().from(escritorios)
        .where(eq(escritorios.id, userAtualizado.escritorioId)).limit(1);

      // Notifica o Root por e-mail com os dados completos do novo cadastro
      sendRootNewUserNotificationEmail({
        nome: userAtualizado.nome,
        email: userAtualizado.email,
        oab: userAtualizado.oab || 'Não informada',
        oabUf: userAtualizado.oabUf || 'BR',
        escritorioNome: escritorio?.nome || 'Escritório',
        telefone: escritorio?.telefone || undefined,
        cnpj: escritorio?.cnpj || undefined,
      }).catch((err) => console.error('[Auth] Erro ao notificar root por e-mail:', err));

      // Envia confirmação de cadastro recebido ao advogado
      sendWelcomeEmail(email, userAtualizado.nome, escritorio?.nome || 'Escritório')
        .catch((err) => console.error('[Auth] Erro ao enviar boas-vindas:', err));
    }

    await recordAudit(req, 'VERIFICACAO_EMAIL_SUCESSO', {
      alvoId: userAtualizado?.id,
      detalhes: { email },
    });

    res.json({
      success: true,
      verified: true,
      message: 'Cadastro confirmado com sucesso! O administrador já foi notificado para liberar o seu acesso.',
    });
  } catch (error) {
    console.error('Erro na verificação de código:', error);
    res.status(500).json({ error: 'Erro ao validar código de verificação.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/reenviar-codigo — reenvio com rate limit de 60s
// ---------------------------------------------------------------------------
router.post('/reenviar-codigo', async (req, res) => {
  try {
    const parsed = parseBody(reenviarCodigoSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { email } = parsed.data;

    const [user] = await db.select({
      id: usuarios.id,
      nome: usuarios.nome,
      emailVerificado: usuarios.emailVerificado,
    }).from(usuarios).where(eq(usuarios.email, email)).limit(1);

    if (!user) {
      return res.status(404).json({ error: 'Cadastro não encontrado para este e-mail.' });
    }

    if (user.emailVerificado) {
      return res.status(400).json({ error: 'Este e-mail já foi verificado anteriormente.' });
    }

    // Cooldown de 60 segundos
    const [ultimoCodigo] = await db.select()
      .from(codigosVerificacao)
      .where(and(eq(codigosVerificacao.email, email), eq(codigosVerificacao.tipo, 'registro')))
      .orderBy(desc(codigosVerificacao.createdAt))
      .limit(1);

    if (ultimoCodigo?.createdAt) {
      const segundosDesdeUltimo = (Date.now() - new Date(ultimoCodigo.createdAt).getTime()) / 1000;
      if (segundosDesdeUltimo < 60) {
        const restante = Math.ceil(60 - segundosDesdeUltimo);
        return res.status(429).json({ error: `Aguarde ${restante}s antes de solicitar um novo código.` });
      }
    }

    // Invalida anteriores
    await db.update(codigosVerificacao)
      .set({ utilizado: true })
      .where(and(eq(codigosVerificacao.email, email), eq(codigosVerificacao.tipo, 'registro')));

    // Gera novo código
    const novoCodigo = String(Math.floor(100000 + Math.random() * 900000));
    const expiraEm = new Date(Date.now() + 60 * 1000);

    await db.insert(codigosVerificacao).values({
      email,
      codigo: novoCodigo,
      tipo: 'registro',
      expiraEm,
    });

    sendVerificationCodeEmail(email, user.nome, novoCodigo).catch((err) => {
      console.error('[Auth] Erro ao reenviar código:', err);
    });

    res.json({
      success: true,
      message: 'Novo código de verificação enviado para seu e-mail.',
    });
  } catch (error) {
    console.error('Erro ao reenviar código:', error);
    res.status(500).json({ error: 'Erro ao reenviar código.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/solicitar-reset-senha — solicita código de recuperação de senha
// Público. Resposta SEMPRE genérica (anti-enumeração de contas cadastradas).
// ---------------------------------------------------------------------------
router.post('/solicitar-reset-senha', async (req, res) => {
  try {
    const parsed = parseBody(solicitarResetSenhaSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { email } = parsed.data;

    // Cooldown de 60 segundos (espelha o padrão do /reenviar-codigo)
    const [ultimoCodigo] = await db.select()
      .from(codigosVerificacao)
      .where(and(eq(codigosVerificacao.email, email), eq(codigosVerificacao.tipo, 'reset_senha')))
      .orderBy(desc(codigosVerificacao.createdAt))
      .limit(1);

    if (ultimoCodigo?.createdAt) {
      const segundosDesdeUltimo = (Date.now() - new Date(ultimoCodigo.createdAt).getTime()) / 1000;
      if (segundosDesdeUltimo < 60) {
        const restante = Math.ceil(60 - segundosDesdeUltimo);
        return res.status(429).json({ error: `Aguarde ${restante}s antes de solicitar um novo código.` });
      }
    }

    const [user] = await db.select({
      id: usuarios.id,
      nome: usuarios.nome,
    }).from(usuarios).where(eq(usuarios.email, email)).limit(1);

    // Só gera e envia o código se o e-mail existir; caso contrário, responde o mesmo sucesso genérico.
    if (user) {
      // Invalida códigos de recuperação anteriores
      await db.update(codigosVerificacao)
        .set({ utilizado: true })
        .where(and(eq(codigosVerificacao.email, email), eq(codigosVerificacao.tipo, 'reset_senha')));

      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      const expiraEm = new Date(Date.now() + 60 * 1000); // 1 minuto

      await db.insert(codigosVerificacao).values({
        email,
        codigo,
        tipo: 'reset_senha',
        expiraEm,
      });

      sendPasswordResetCodeEmail(email, user.nome, codigo).catch((err) => {
        console.error('[Auth] Falha no envio de código de recuperação:', err);
      });
    }

    // Resposta genérica: não revela se o e-mail está cadastrado.
    res.json({
      success: true,
      message: 'Se o e-mail estiver cadastrado, enviaremos um código de recuperação.',
    });
  } catch (error) {
    console.error('Erro ao solicitar redefinição de senha:', error);
    res.status(500).json({ error: 'Erro ao solicitar redefinição de senha.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/redefinir-senha — redefine a senha com o código de recuperação
// Público. Valida o código, aplica a nova senha e invalida o código usado.
// ---------------------------------------------------------------------------
router.post('/redefinir-senha', async (req, res) => {
  try {
    const parsed = parseBody(redefinirSenhaSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { email, codigo, novaSenha } = parsed.data;

    // Busca o código ativo mais recente de recuperação
    const [registroCodigo] = await db.select()
      .from(codigosVerificacao)
      .where(and(
        eq(codigosVerificacao.email, email),
        eq(codigosVerificacao.tipo, 'reset_senha'),
        eq(codigosVerificacao.utilizado, false),
      ))
      .orderBy(desc(codigosVerificacao.createdAt))
      .limit(1);

    if (!registroCodigo) {
      return res.status(400).json({ error: 'Nenhum código de recuperação pendente para este e-mail.' });
    }

    if (new Date() > new Date(registroCodigo.expiraEm)) {
      return res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
    }

    if (registroCodigo.tentativas >= 5) {
      return res.status(400).json({ error: 'Número máximo de tentativas excedido. Solicite um novo código.' });
    }

    if (registroCodigo.codigo !== codigo) {
      await db.update(codigosVerificacao)
        .set({ tentativas: registroCodigo.tentativas + 1 })
        .where(eq(codigosVerificacao.id, registroCodigo.id));
      return res.status(400).json({ error: 'Código incorreto.' });
    }

    const [user] = await db.select({
      id: usuarios.id,
      nome: usuarios.nome,
    }).from(usuarios).where(eq(usuarios.email, email)).limit(1);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 12);
    await db.update(usuarios)
      .set({ senha: senhaHash, precisaTrocarSenha: false })
      .where(eq(usuarios.id, user.id));

    // Marca o código como utilizado
    await db.update(codigosVerificacao)
      .set({ utilizado: true })
      .where(eq(codigosVerificacao.id, registroCodigo.id));

    await recordAudit(req, 'PASSWORD_RESET_SELF', {
      alvoId: user.id,
      alvoEmail: email,
    });

    res.json({
      success: true,
      message: 'Senha redefinida com sucesso. Faça login com a nova senha.',
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ error: 'Erro ao redefinir a senha.' });
  }
});

router.get('/me', authMiddleware, refreshSession, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  const [tokensMes, limiteTokensMes] = await Promise.all([
    req.user.id ? getTokenUsageMes(req.user.id) : Promise.resolve(0),
    getLimiteEfetivo(req.user.id, req.user.escritorioId),
  ]);
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      email: req.user.email,
      escritorioId: req.user.escritorioId ?? null,
      permissoes: req.user.permissoes ?? [],
      precisaTrocarSenha: req.user.precisaTrocarSenha ?? false,
      tokensMes,
      limiteTokensMes,
    },
  });
});

router.post('/trocar-senha', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { senhaAtual, novaSenha } = (req.body ?? {}) as { senhaAtual?: string; novaSenha?: string };

  if (typeof novaSenha !== 'string' || novaSenha.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });
  }
  // Decisão segura: a senha atual é SEMPRE exigida (inclusive quando precisaTrocarSenha=true,
  // pois o usuário deve saber a senha temporária informada pelo admin).
  if (typeof senhaAtual !== 'string' || !senhaAtual) {
    return res.status(400).json({ error: 'A senha atual é obrigatória.' });
  }
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }

  try {
    const [user] = await db.select().from(usuarios).where(eq(usuarios.id, req.user.id)).limit(1);
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    const isValid = await bcrypt.compare(senhaAtual, user.senha);
    if (!isValid) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 12);
    await db.update(usuarios).set({ senha: senhaHash, precisaTrocarSenha: false })
      .where(eq(usuarios.id, user.id));
    await recordAudit(req, 'PASSWORD_CHANGE', {});

    // Revoga o token antigo (que ainda carregava precisaTrocarSenha=true)
    const oldToken = resolveTokenFromRequest(req);
    if (oldToken) {
      try {
        const decoded = jwt.verify(oldToken, SECRET);
        if (typeof decoded === 'object' && decoded !== null && decoded.jti && typeof decoded.exp === 'number') {
          revokeToken(decoded.jti, decoded.exp * 1000);
        }
      } catch {
        // Token inválido/expirado: nada a revogar.
      }
    }

    const permRows = await db.select({ modulo: permissoesUsuario.modulo }).from(permissoesUsuario)
      .where(and(eq(permissoesUsuario.usuarioId, user.id), eq(permissoesUsuario.ativo, true)));
    const permissoes = permRows.map((r) => r.modulo);

    const jti = randomUUID();
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        name: user.nome,
        email: user.email,
        escritorioId: user.escritorioId,
        permissoes,
        precisaTrocarSenha: false,
        jti,
      },
      SECRET,
      { expiresIn: '1d' }
    );

    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.json({
      user: {
        id: user.id,
        name: user.nome,
        role: user.role,
        email: user.email,
        escritorioId: user.escritorioId,
        permissoes,
        precisaTrocarSenha: false,
      },
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Erro ao trocar a senha.' });
  }
});

router.post('/logout', (req, res) => {
  const token = resolveTokenFromRequest(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, SECRET);
      if (typeof decoded === 'object' && decoded !== null && decoded.jti && typeof decoded.exp === 'number') {
        revokeToken(decoded.jti, decoded.exp * 1000);
      }
    } catch {
      // Token inválido/expirado: nada a revogar. Ainda assim limpa o cookie e responde sucesso.
    }
  }

  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.status(200).json({ message: 'Logout realizado com sucesso.' });
});

export default router;
