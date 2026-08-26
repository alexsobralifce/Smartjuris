import '../config.js';

import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const resendApiKey = process.env.RESEND_API_KEY;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const defaultFrom = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || (smtpUser ? `SmartJuris <${smtpUser}>` : 'SmartJuris <onboarding@resend.dev>');

// Remetente específico para o Resend. O Resend só aceita remetentes de domínios
// verificados (onboarding@resend.dev é o remetente padrão de teste). Esta cadeia
// NUNCA deve usar EMAIL_FROM nem smtpUser — ambos costumam ser o endereço Gmail,
// que não é verificável no Resend e faria todo fallback falhar com
// "domain not verified". Se usar um domínio próprio, defina RESEND_FROM_EMAIL.
const resendFrom = process.env.RESEND_FROM_EMAIL || 'SmartJuris <onboarding@resend.dev>';

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const smtpTransporter = (smtpUser && smtpPass)
  ? nodemailer.createTransport({
      service: process.env.SMTP_SERVICE || 'gmail',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (process.env.SMTP_SECURE === 'true' || !process.env.SMTP_PORT || process.env.SMTP_PORT === '465'),
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      // Timeouts obrigatórios: sem eles, se o Railway não alcançar o Gmail
      // (egress/DNS/trava), o sendMail fica pendurado indefinidamente sem log.
      // Com estes valores, a falha retorna rápido (e cai no Resend) com erro claro.
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 10000, // 10s p/ abrir a conexão
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 10000,     // 10s p/ resposta do servidor
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 15000,         // 15s p/ envio/leitura
    })
  : null;

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
 * Envia um e-mail transacional via Nodemailer (SMTP / Gmail) ou Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const recipient = Array.isArray(options.to) ? options.to.join(', ') : options.to;

  // GATE ANTI-CUSTO (baliza): em testes (NODE_ENV=test) ou quando EMAIL_DISABLED
  // é true, NÃO envia e-mail real — simula sucesso. Protege o limite do
  // provedor transacional (Resend/SMTP) durante a suíte e em ambientes de QA.
  const emailDisabled =
    process.env.EMAIL_DISABLED === 'true' ||
    process.env.EMAIL_DISABLED === '1' ||
    process.env.NODE_ENV === 'test';
  if (emailDisabled) {
    console.log(`[Email] ENVIO DESATIVADO (EMAIL_DISABLED/test) — simulado: to=${recipient}, subject="${options.subject}"`);
    return { success: true, id: `simulado-${Date.now()}` };
  }

  // 1. TRANSPORTE PRINCIPAL: Resend (enviador transacional confiável via API HTTP,
  //    independe de egress de datacenter para SMTP). Requer domínio verificado —
  //    veja RESEND_FROM_EMAIL. Se falhar, cai no SMTP como reserva.
  if (resend) {
    const resendFromAddress = options.from || resendFrom;
    console.log(`[Email-Resend] Tentando envio via Resend (from=${resendFromAddress}, to=${recipient})`);
    try {
      const { data, error } = await resend.emails.send({
        from: resendFromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
      });

      if (error) {
        console.error(`[Email-Resend] Erro da API Resend: ${error.message}. Tentando fallback SMTP.`);
      } else {
        console.log(`[Email-Resend] E-mail enviado com sucesso: ID=${data?.id}, Para=${recipient}, Assunto="${options.subject}"`);
        return { success: true, id: data?.id };
      }
    } catch (err: any) {
      console.error(`[Email-Resend] Falha de comunicação com Resend: ${err?.message || err}. Tentando fallback SMTP.`);
    }
  }

  // 2. RESERVA: SMTP (Gmail via Nodemailer). Usado quando Resend não configurado
  //    ou falhou.
  const smtpFrom = options.from || defaultFrom;
  if (smtpTransporter) {
    console.log(`[Email-SMTP] Tentando envio via SMTP (${process.env.SMTP_HOST || 'smtp.gmail.com'}:${process.env.SMTP_PORT || 465}, from=${smtpFrom}, to=${recipient})`);
    try {
      const info = await smtpTransporter.sendMail({
        from: smtpFrom,
        to: recipient,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
      });

      console.log(`[Email-SMTP] E-mail enviado com sucesso: ID=${info.messageId}, Para=${recipient}, Assunto="${options.subject}"`);
      return { success: true, id: info.messageId };
    } catch (smtpErr: any) {
      const code = smtpErr?.code ? ` | code=${smtpErr.code}` : '';
      const responseCode = smtpErr?.responseCode ? ` | responseCode=${smtpErr.responseCode}` : '';
      console.error(`[Email-SMTP] Erro ao enviar via SMTP: ${smtpErr?.message || smtpErr}${code}${responseCode}.`);
      return { success: false, error: smtpErr?.message || 'Falha no envio via SMTP.' };
    }
  }

  // 3. Nenhum transporte disponível.
  const motivo = !resend && !smtpTransporter
    ? 'Serviço de e-mail não configurado (configure Resend ou SMTP).'
    : 'Todos os transportes de e-mail falharam.';
  console.warn(`[Email] ${motivo} Envio não realizado: ${options.subject}`);
  return { success: false, error: motivo };
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
      <p style="font-size: 12px; color: #7a7870; margin-top: 8px;">Este código é válido por <strong>1 minuto</strong>.</p>
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
 * E-mail com Código de Recuperação de Senha (OTP de 6 dígitos)
 */
export async function sendPasswordResetCodeEmail(to: string, nome: string, codigo: string): Promise<EmailResult> {
  const body = `
    <span class="badge" style="background: #fef3c7; color: #92400e; border-color: #fcd34d;">Recuperação de Senha</span>
    <h2 style="margin: 0 0 12px; color: #1a2744; font-size: 20px;">Olá, ${nome}!</h2>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>SmartJuris</strong>. Utilize o código abaixo:</p>
    <div style="text-align: center; margin: 28px 0;">
      <div style="display: inline-block; background: #f4f3f0; border: 2px dashed #c8a84b; border-radius: 8px; padding: 16px 36px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.25em; color: #1a2744;">
          ${codigo}
        </span>
      </div>
      <p style="font-size: 12px; color: #7a7870; margin-top: 8px;">Este código é válido por <strong>1 minuto</strong>.</p>
    </div>
    <p style="font-size: 14px; color: #555;">Se você não solicitou esta redefinição, por favor desconsidere esta mensagem e mantenha sua senha atual.</p>
  `;

  return sendEmail({
    to,
    subject: `${codigo} é o seu código de recuperação — SmartJuris`,
    html: emailWrapper('Recuperação de Senha — SmartJuris', body),
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
    <p>Um novo usuário confirmou o e-mail e <strong>já está ativo</strong> no sistema. Conceda os <strong>créditos de uso</strong> pelo Painel Root.</p>
    
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
      <a href="https://smartjuris-web-production.up.railway.app" class="button">Conceder Créditos no Painel Root →</a>
    </p>
  `;

  return sendEmail({
    to: rootRecipient,
    subject: `🔔 Novo Cadastro: ${params.nome} (${params.escritorioNome}) — Ativo, aguarda créditos`,
    html: emailWrapper('Novo Cadastro no SmartJuris', body),
  });
}

/**
 * E-mail de Boas-Vindas e Confirmação de Cadastro
 */
export async function sendWelcomeEmail(to: string, nome: string, escritorio: string): Promise<EmailResult> {
  const body = `
    <span class="badge" style="background: #f5edd6; color: #92400e; border-color: #e6cf8f;">Bem-vindo ao SmartJuris</span>
    <h2 style="margin: 0 0 12px; color: #1a2744; font-size: 22px;">Olá, ${nome}! Sua conta está quase pronta 🎉</h2>
    <p style="margin: 0 0 8px;">Ficamos muito felizes em receber <strong>${nome}</strong> — e o escritório <strong>${escritorio}</strong> — na plataforma SmartJuris.</p>
    <p>Seu cadastro foi recebido com sucesso. Enquanto o acesso é liberado pelo administrador, saiba o que preparamos para impulsionar a sua rotina jurídica com inteligência artificial:</p>

    <table style="width: 100%; border-collapse: collapse; margin: 22px 0; font-size: 14px;">
      <tr>
        <td style="padding: 10px 0; vertical-align: top;"><span style="font-size: 20px;">⚖️</span></td>
        <td style="padding: 10px 0 10px 12px; vertical-align: top; border-bottom: 1px solid #eeede9;">
          <strong style="color: #1a2744;">Motor RAG de Redação</strong><br>
          <span style="color: #555;">Gere peças jurídicas com IA com base na sua jurisprudência e documentos, com fila de validação humana.</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; vertical-align: top;"><span style="font-size: 20px;">📊</span></td>
        <td style="padding: 10px 0 10px 12px; vertical-align: top; border-bottom: 1px solid #eeede9;">
          <strong style="color: #1a2744;">Jurimetria Preditiva</strong><br>
          <span style="color: #555;">Analytics de taxa de êxito por área e calculadora preditiva de risco para decisões mais seguras.</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; vertical-align: top;"><span style="font-size: 20px;">📜</span></td>
        <td style="padding: 10px 0 10px 12px; vertical-align: top; border-bottom: 1px solid #eeede9;">
          <strong style="color: #1a2744;">Linha do Tempo Inteligente</strong><br>
          <span style="color: #555;">Resumo de intimações por IA com ação recomendada e prazos fatais, direto no seu Matter Dashboard.</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; vertical-align: top;"><span style="font-size: 20px;">🔎</span></td>
        <td style="padding: 10px 0 10px 12px; vertical-align: top; border-bottom: 1px solid #eeede9;">
          <strong style="color: #1a2744;">Jurisprudência em 16 Tribunais</strong><br>
          <span style="color: #555;">Busca unificada e ao vivo de decisões para fundamentar suas teses com precisão.</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; vertical-align: top;"><span style="font-size: 20px;">🗂️</span></td>
        <td style="padding: 10px 0 10px 12px; vertical-align: top; border-bottom: 1px solid #eeede9;">
          <strong style="color: #1a2744;">Gestão de Processos</strong><br>
          <span style="color: #555;">Matter Dashboard completo para acompanhar cada caso, com time line, documentos e prazos em um só lugar.</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; vertical-align: top;"><span style="font-size: 20px;">💰</span></td>
        <td style="padding: 10px 0 10px 12px; vertical-align: top; border-bottom: 1px solid #eeede9;">
          <strong style="color: #1a2744;">Financeiro com Timesheet</strong><br>
          <span style="color: #555;">Controle de honorários, despesas e horas faturáveis com cronômetro de timesheet.</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; vertical-align: top;"><span style="font-size: 20px;">📈</span></td>
        <td style="padding: 10px 0 10px 12px; vertical-align: top;">
          <strong style="color: #1a2744;">CRM & Funil de Vendas</strong><br>
          <span style="color: #555;">Pipeline kanban de Lead à Contrato com alerta automático de conflito de interesses.</span>
        </td>
      </tr>
    </table>

    <div style="background: #f4f3f0; border-left: 3px solid #c8a84b; padding: 14px 18px; margin: 20px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; font-size: 14px;"><strong>Status da Conta:</strong> Seu e-mail foi confirmado e o escritório <strong>${escritorio}</strong> está em processo de liberação pelo administrador da plataforma. Você receberá um aviso assim que o acesso for ativado.</p>
    </div>

    <p style="margin: 16px 0 4px; font-size: 15px;">Comece agora mesmo a futura gestão do seu escritório:</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="https://smartjuris-web-production.up.railway.app" class="button">Acessar o SmartJuris e explorar os recursos →</a>
    </p>
    <p style="font-size: 13px; color: #7a7870; text-align: center;">Se tiver qualquer dúvida, nosso suporte técnico está à sua disposição. Estamos aqui para te ajudar a crescer. 💛</p>
  `;

  return sendEmail({
    to,
    subject: `Bem-vindo ao SmartJuris, ${nome}! Seu escritório ${escritorio} chegou na era da IA 🚀`,
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

/** Alerta de custo do piloto controlado (Fase 4B) — observabilidade, best-effort. */
export async function sendPilotCostAlert(params: {
  to: string;
  escritorioId: string;
  ciclo: string;
  custoCents: string;
}): Promise<EmailResult> {
  const body = `
    <span class="badge" style="background: #fef3c7; color: #92400e; border-color: #fcd34d;">
      ⚠️ Piloto — Alerta de Custo
    </span>
    <h2 style="margin: 0 0 16px; color: #1a2744; font-size: 20px;">Custo do escritório acima do limiar do piloto</h2>
    <p>O escritório <strong>${params.escritorioId}</strong> consumiu <strong>${params.custoCents} cents</strong>
    no ciclo <strong>${params.ciclo}</strong>, ultrapassando o limiar configurado do piloto.</p>
    <p>Revise a utilização e o orçamento antes de prosseguir com o piloto controlado.</p>
  `;
  return sendEmail({
    to: params.to,
    subject: `⚠️ [Piloto] Alerta de custo — ${params.escritorioId} (${params.ciclo})`,
    html: emailWrapper('Piloto — Alerta de Custo', body),
  });
}
