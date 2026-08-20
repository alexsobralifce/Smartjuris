import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const defaultFrom = process.env.RESEND_FROM_EMAIL || 'SmartJuris <onboarding@resend.dev>';

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Base email layout wrapper with SmartJuris visual identity
 */
function emailWrapper(title: string, bodyContent: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f3f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #18170f;
    }
    .container {
      max-width: 600px;
      margin: 30px auto;
      background-color: #ffffff;
      border: 1px solid #d8d6d0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
    }
    .header {
      background-color: #1a2744;
      padding: 28px 32px;
      text-align: left;
      border-bottom: 3px solid #c8a84b;
    }
    .header-logo {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
    }
    .header-subtitle {
      font-size: 11px;
      color: #c8a84b;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .content {
      padding: 32px;
      line-height: 1.6;
      font-size: 15px;
      color: #2e2c29;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      background: #fdf6e2;
      color: #92400e;
      border: 1px solid #f6e09e;
      margin-bottom: 16px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #1a2744;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      margin-top: 20px;
    }
    .footer {
      padding: 24px 32px;
      background-color: #f9f8f6;
      border-top: 1px solid #eeede9;
      font-size: 12px;
      color: #7a7870;
      text-align: center;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-logo">SmartJuris</div>
      <div class="header-subtitle">Sistema Jurídico com Inteligência Artificial</div>
    </div>
    <div class="content">
      ${bodyContent}
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px;">Este é um e-mail transacional automático do SmartJuris.</p>
      <p style="margin: 0; color: #a5a39d;">SmartJuris SaaS Jurídico · Segurança e Governança OAB</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Envia um e-mail genérico via Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY não configurada. E-mail não enviado:', options.subject, 'para:', options.to);
    return { success: false, error: 'RESEND_API_KEY não configurada no servidor.' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: options.from || defaultFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });

    if (error) {
      console.error('[Email] Erro ao enviar e-mail via Resend:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] E-mail enviado com sucesso: ID=${data?.id}, Para=${options.to}, Assunto="${options.subject}"`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Email] Falha de comunicação com Resend:', err);
    return { success: false, error: err?.message || 'Erro de comunicação ao enviar e-mail.' };
  }
}

/**
 * E-mail com Código de Verificação de Cadastro (OTP de 6 dígitos)
 */
export async function sendVerificationCodeEmail(to: string, nome: string, codigo: string): Promise<EmailResult> {
  const body = `
    <span class="badge" style="background: #fdf6e2; color: #92400e; border-color: #f6e09e;">Confirmação de E-mail</span>
    <h2 style="margin: 0 0 12px; color: #1a2744; font-size: 20px;">Olá, ${nome}!</h2>
    <p>Obrigado por se cadastrar no <strong>SmartJuris</strong>. Para validar seu endereço de e-mail e prosseguir com a ativação do seu escritório, utilize o código de segurança abaixo:</p>
    
    <div style="text-align: center; margin: 28px 0;">
      <div style="display: inline-block; background: #f4f3f0; border: 2px dashed #c8a84b; border-radius: 8px; padding: 16px 36px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.25em; color: #1a2744;">
          ${codigo}
        </span>
      </div>
      <p style="font-size: 12px; color: #7a7870; margin-top: 8px;">Este código é válido por <strong>15 minutos</strong>.</p>
    </div>

    <p style="font-size: 14px; color: #555;">Se você não solicitou este cadastro, por favor desconsidere esta mensagem.</p>
  `;

  return sendEmail({
    to,
    subject: `${codigo} é o seu código de verificação — SmartJuris`,
    html: emailWrapper('Código de Verificação SmartJuris', body),
  });
}

/**
 * E-mail para o Administrador Root sobre Novo Cadastro Verificado
 */
export async function sendRootNewUserNotificationEmail(params: {
  nome: string;
  email: string;
  oab: string;
  oabUf: string;
  escritorioNome: string;
  telefone?: string;
  cnpj?: string;
  rootEmail?: string;
}): Promise<EmailResult> {
  const rootRecipient = params.rootEmail || process.env.ROOT_NOTIFICATION_EMAIL || 'alexandresobral2004@gmail.com';

  const body = `
    <span class="badge" style="background: #e0f2fe; color: #0369a1; border-color: #bae6fd;">Novo Cadastro Verificado</span>
    <h2 style="margin: 0 0 16px; color: #1a2744; font-size: 20px;">Novo Advogado Cadastrado no SmartJuris</h2>
    <p>Um novo usuário concluiu a verificação de e-mail e está <strong>aguardando liberação de acesso e concessão de créditos</strong> no Painel Root.</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870; width: 140px;"><strong>Advogado(a):</strong></td>
        <td style="padding: 8px 0; font-weight: 600; color: #1a2744;">${params.nome}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870;"><strong>E-mail:</strong></td>
        <td style="padding: 8px 0;"><a href="mailto:${params.email}" style="color: #1a2744;">${params.email}</a></td>
      </tr>
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870;"><strong>OAB:</strong></td>
        <td style="padding: 8px 0;">${params.oab}/${params.oabUf}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870;"><strong>Escritório:</strong></td>
        <td style="padding: 8px 0; font-weight: 600;">${params.escritorioNome}</td>
      </tr>
      ${params.telefone ? `
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870;"><strong>Telefone:</strong></td>
        <td style="padding: 8px 0;">${params.telefone}</td>
      </tr>
      ` : ''}
      ${params.cnpj ? `
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870;"><strong>CNPJ:</strong></td>
        <td style="padding: 8px 0;">${params.cnpj}</td>
      </tr>
      ` : ''}
    </table>

    <p style="text-align: center; margin: 28px 0;">
      <a href="https://smartjuris-web-production.up.railway.app" class="button">Acessar Painel Root para Ativar e Conceder Créditos →</a>
    </p>
  `;

  return sendEmail({
    to: rootRecipient,
    subject: `🔔 Novo Cadastro: ${params.nome} (${params.escritorioNome}) — Aguarda Ativação`,
    html: emailWrapper('Novo Cadastro no SmartJuris', body),
  });
}

/**
 * E-mail de Boas-Vindas e Confirmação de Cadastro
 */
export async function sendWelcomeEmail(to: string, nome: string, escritorio: string): Promise<EmailResult> {
  const body = `
    <span class="badge">Novo Cadastro</span>
    <h2 style="margin: 0 0 16px; color: #1a2744; font-size: 20px;">Bem-vindo ao SmartJuris, ${nome}!</h2>
    <p>Seu cadastro para o escritório <strong>${escritorio}</strong> foi recebido com sucesso em nossa plataforma.</p>
    <p>O SmartJuris oferece motor de RAG para redação automatizada de peças, linha do tempo com resumo de intimações por IA, jurimetria preditiva e busca unificada de jurisprudência em 16 tribunais.</p>
    <div style="background: #f4f3f0; border-left: 3px solid #c8a84b; padding: 14px 18px; margin: 20px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; font-size: 14px;"><strong>Status da Conta:</strong> Seu e-mail foi confirmado e seu escritório está em processo de liberação pelo administrador da plataforma. Você receberá um aviso assim que o acesso for ativado.</p>
    </div>
    <p>Se tiver qualquer dúvida, nosso suporte técnico está à disposição.</p>
  `;

  return sendEmail({
    to,
    subject: `Bem-vindo ao SmartJuris — ${escritorio}`,
    html: emailWrapper('Bem-vindo ao SmartJuris', body),
  });
}

/**
 * E-mail de Ativação do Escritório (pelo Root) com Créditos Concedidos
 */
export async function sendAccountActivatedEmail(
  to: string,
  nome: string,
  escritorio: string,
  creditos?: number | null,
  loginUrl = 'https://smartjuris-web-production.up.railway.app'
): Promise<EmailResult> {
  const creditosFmt = creditos != null ? new Intl.NumberFormat('pt-BR').format(creditos) : null;

  const body = `
    <span class="badge" style="background: #e8f5e9; color: #2d6a4f; border-color: #c8e6c9;">Conta Ativada</span>
    <h2 style="margin: 0 0 16px; color: #1a2744; font-size: 20px;">Seu escritório está ativo no SmartJuris!</h2>
    <p>Olá, <strong>${nome}</strong>,</p>
    <p>Temos o prazer de informar que o acesso para o escritório <strong>${escritorio}</strong> foi ativado com sucesso pelo administrador da plataforma.</p>
    
    ${creditosFmt ? `
    <div style="background: #f4f3f0; border: 1px solid #c8a84b; border-radius: 6px; padding: 16px 20px; margin: 20px 0;">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #92400e; letter-spacing: 0.05em;">Saldo de Créditos Liberado</div>
      <div style="font-size: 24px; font-weight: 700; color: #1a2744; margin-top: 4px;">🔋 ${creditosFmt} créditos mensais</div>
      <div style="font-size: 13px; color: #7a7870; margin-top: 4px;">Utilize seus créditos para gerar peças com IA, resumos de intimações e pesquisas preditivas.</div>
    </div>
    ` : ''}

    <p>Você já pode acessar o painel, vincular sua equipe, cadastrar processos e utilizar todas as ferramentas de inteligência jurídica.</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${loginUrl}" class="button">Acessar o Painel SmartJuris →</a>
    </p>
    <p style="font-size: 13px; color: #7a7870;">Dica: Salve o link em seus favoritos para acesso rápido.</p>
  `;

  return sendEmail({
    to,
    subject: `Acesso Liberado: Escritório ${escritorio} no SmartJuris`,
    html: emailWrapper('Escritório Ativado — SmartJuris', body),
  });
}

/**
 * E-mail de Alerta de Prazo Crítico
 */
export async function sendDeadlineAlertEmail(params: {
  to: string;
  advogado: string;
  prazoData: string;
  diasRestantes: number;
  processo: string;
  cliente: string;
  tipo: string;
  vara?: string;
}): Promise<EmailResult> {
  const isUrgente = params.diasRestantes <= 2;
  const badgeStyle = isUrgente 
    ? 'background: #fde8e8; color: #7f1d1d; border-color: #fca5a5;'
    : 'background: #fef3c7; color: #92400e; border-color: #fcd34d;';

  const body = `
    <span class="badge" style="${badgeStyle}">
      ${isUrgente ? '⚠️ Prazo Fatal Urgente' : '📅 Alerta de Prazo Processual'}
    </span>
    <h2 style="margin: 0 0 16px; color: #1a2744; font-size: 20px;">Atenção ao Prazo: ${params.tipo}</h2>
    <p>Prezado(a) <strong>Dr(a). ${params.advogado}</strong>,</p>
    <p>Identificamos um prazo com vencimento próximo para o seu acompanhamento:</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870; width: 140px;"><strong>Data Fatal:</strong></td>
        <td style="padding: 8px 0; font-weight: 700; color: ${isUrgente ? '#7f1d1d' : '#1a2744'};">${params.prazoData} (${params.diasRestantes === 0 ? 'HOJE' : params.diasRestantes === 1 ? 'AMANHÃ' : `em ${params.diasRestantes} dias`})</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870;"><strong>Tipo / Peça:</strong></td>
        <td style="padding: 8px 0;">${params.tipo}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870;"><strong>Cliente:</strong></td>
        <td style="padding: 8px 0;">${params.cliente}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeede9;">
        <td style="padding: 8px 0; color: #7a7870;"><strong>Processo:</strong></td>
        <td style="padding: 8px 0; font-family: monospace;">${params.processo}</td>
      </tr>
      ${params.vara ? `
      <tr>
        <td style="padding: 8px 0; color: #7a7870;"><strong>Juízo/Vara:</strong></td>
        <td style="padding: 8px 0;">${params.vara}</td>
      </tr>
      ` : ''}
    </table>

    <p style="text-align: center; margin: 24px 0;">
      <a href="https://smartjuris-web-production.up.railway.app" class="button">Visualizar na Agenda →</a>
    </p>
  `;

  return sendEmail({
    to: params.to,
    subject: `${isUrgente ? '🚨 URGENTE: ' : '📅 '}Prazo em ${params.prazoData} — ${params.cliente} (${params.tipo})`,
    html: emailWrapper('Alerta de Prazo Processual', body),
  });
}
