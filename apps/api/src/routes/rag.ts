import { Router } from 'express';
import type OpenAI from 'openai';
import { db } from '../db/client.js';
import { processos, clientes, usuarios, escritorios } from '../db/schema.js';
import { generateEmbedding } from '../services/embedding.js';
import { trackTokenUsage, checkTokenQuota } from '../services/usage.js';
import { decryptField } from '../services/crypto.js';
import { deepseekClient, deepseekModel, deepseekModelPro, selecionarModeloDeepSeek, opcoesQwen } from '../services/ai.js';
import {
  validarProcessoDoEscritorio,
  buscarChunksPorEmbedding,
  buscarChunksPorKeywords,
} from '../services/documento.js';
import { aiRateLimiter } from '../middlewares/rateLimit.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { tenantScopeEscritorioId } from '../middlewares/tenantGuard.js';
import { recordAudit } from '../middlewares/audit.js';
import { and, eq } from 'drizzle-orm';
import { parseBody, formatZodError, ragGenerateSchema } from '../validation/schemas.js';
import { AREAS, MODELOS_PECA, buscarModelo } from '../services/modelosPeca.js';

const router = Router();

async function criarStreamComFallback(
  isComplex: boolean,
  params: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming, 'model'>,
  signal: AbortSignal
) {
  const principal = selecionarModeloDeepSeek(isComplex);
  const reserva = isComplex ? deepseekModel : deepseekModelPro;
  try {
    const stream = await deepseekClient.chat.completions.create({ ...params, model: principal, ...opcoesQwen(principal) }, { signal });
    return { stream, modelUsado: principal };
  } catch (err: any) {
    console.warn(`[RAG] ${principal} falhou, tentando ${reserva}:`, err?.message);
    const stream = await deepseekClient.chat.completions.create({ ...params, model: reserva, ...opcoesQwen(reserva) }, { signal });
    return { stream, modelUsado: reserva };
  }
}

router.get('/modelos', async (_req, res) => {
  try {
    const areas = AREAS.map(nome => ({
      nome,
      tipos: MODELOS_PECA.filter(m => m.area === nome).map(m => ({ tipo: m.tipo, modelo: m })),
    }));
    res.json({ areas });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar modelos.' });
  }
});

router.post('/generate', aiRateLimiter, async (req, res) => {
  const controller = new AbortController();
  let aborted = false;
  const abort = () => {
    if (aborted) return;
    aborted = true;
    controller.abort();
  };
  // Max 2 minutes per generation
  const timeout = setTimeout(abort, 120000);

  try {
    const parsed = parseBody(ragGenerateSchema, req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const { tipo, area, dadosCaso, isComplex } = parsed.data;

    // Fase 2A — escopo derivado do contexto autenticado (nunca do cliente).
    const escritorioId = tenantScopeEscritorioId(req as AuthenticatedRequest);
    if (!escritorioId) {
      await recordAudit(req, 'RAG_BLOQUEADO', { detalhes: { motivo: 'sem-escopo-escritorio' } });
      return res.status(403).json({ error: 'Sem escopo de escritório para geração de peças.' });
    }

    // processoId (se enviado) deve pertencer ao MESMO escritório.
    if (parsed.data.processoId) {
      const pertence = await validarProcessoDoEscritorio(parsed.data.processoId, escritorioId);
      if (!pertence) {
        await recordAudit(req, 'RAG_BLOQUEADO', {
          alvoId: parsed.data.processoId,
          detalhes: { motivo: 'processo-de-outro-escritorio' },
        });
        return res.status(403).json({ error: 'Processo informado não pertence ao escritório do usuário.' });
      }
    }

    // Estrutura obrigatória da peça a partir do catálogo de modelos
    const modelo = buscarModelo(tipo, area);
    const estrutura = modelo
      ? modelo.secoes.map((s, i) => `${i + 1}. ${s.titulo} — ${s.instrucao}`).join('\n')
      : '';

    // ── Dados estruturados: partes, advogado e escritório reais injetados ─────
    // Elimina placeholders ("...", "[número]") na qualificação e na assinatura:
    // o processo vinculado (se enviado) fornece as partes/vara/valor, o cliente
    // do mesmo escritório fornece CPF/CNPJ/endereço, e o usuário logado fornece
    // nome/OAB para o signatário.
    let blocoDados = '';
    try {
      const autorId = (req as AuthenticatedRequest).user?.id;
      const linhas: string[] = [];

      const processoIdVinculado = parsed.data.processoId;
      let processoRow: typeof processos.$inferSelect | undefined;
      if (processoIdVinculado) {
        // Defesa em profundidade: processo já validado no mesmo escritório acima.
        [processoRow] = await db.select().from(processos)
          .where(and(eq(processos.id, processoIdVinculado), eq(processos.escritorioId, escritorioId)))
          .limit(1);
      }

      if (processoRow) {
        linhas.push(`Autor: ${processoRow.cliente || 'a definir'}`);
        linhas.push(`Réu: ${processoRow.adverso || 'a definir'}`);
        if (processoRow.numero) linhas.push(`Processo nº: ${processoRow.numero}`);
        if (processoRow.vara) linhas.push(`Vara: ${processoRow.vara}`);
        if (processoRow.valor) linhas.push(`Valor: ${processoRow.valor}`);

        // Melhor esforço: dados cadastrais do cliente (mesmo escritório), por nome.
        if (processoRow.cliente && escritorioId) {
          const [clienteRow] = await db.select({
            cpfCnpj: clientes.cpfCnpj,
            logradouro: clientes.logradouro,
            numero: clientes.numero,
            complemento: clientes.complemento,
            bairro: clientes.bairro,
            cidade: clientes.cidade,
            uf: clientes.uf,
            cep: clientes.cep,
          }).from(clientes)
            .where(and(eq(clientes.nome, processoRow.cliente), eq(clientes.escritorioId, escritorioId)))
            .limit(1);
          if (clienteRow) {
            // CPF/CNPJ fica criptografado no banco (LGPD): descriptografa antes de
            // injetar no prompt. Nunca expor o ciphertext nem derrubar a geração.
            if (clienteRow.cpfCnpj) {
              let cpf: string | null = null;
              try { cpf = decryptField(clienteRow.cpfCnpj) || null; } catch { cpf = null; }
              if (cpf) linhas.push(`CPF/CNPJ do autor: ${cpf}`);
            }
            const endereco = [clienteRow.logradouro, clienteRow.numero, clienteRow.complemento, clienteRow.bairro, clienteRow.cidade, clienteRow.uf, clienteRow.cep]
              .filter(Boolean).join(', ');
            if (endereco) linhas.push(`Endereço do autor: ${endereco}`);
          }
        }
      }

      // Advogado signatário (usuário logado) — a assinatura é SEMPRE do advogado.
      if (autorId) {
        const [advRow] = await db.select({
          nome: usuarios.nome,
          oab: usuarios.oab,
          oabUf: usuarios.oabUf,
        }).from(usuarios).where(eq(usuarios.id, autorId)).limit(1);
        if (advRow) {
          const oab = advRow.oab
            ? `OAB/${(advRow.oabUf || '').trim()} ${advRow.oab}`.replace(/OAB\/\s+/, 'OAB/').trim()
            : '';
          linhas.push(`Advogado signatário: ${advRow.nome}${oab ? `, ${oab}` : ''}`);
        }
      }

      // Escritório (contexto do timbre).
      if (escritorioId) {
        const [escRow] = await db.select({
          razaoSocial: escritorios.razaoSocial,
          cidade: escritorios.cidade,
          uf: escritorios.uf,
        }).from(escritorios).where(eq(escritorios.id, escritorioId)).limit(1);
        if (escRow?.razaoSocial) linhas.push(`Escritório: ${escRow.razaoSocial}`);
      }

      if (linhas.length > 0) {
        blocoDados = `\nDADOS ESTRUTURADOS DO CASO (use EXATAMENTE estes dados na qualificação das partes, nos pedidos e nos requerimentos; não invente outros):\n${linhas.map(l => `- ${l}`).join('\n')}`;
      }
    } catch (e: any) {
      // Nunca derruba a geração por falha no enriquecimento de dados.
      console.warn('[RAG] Falha ao enriquecer dados estruturados:', e?.message);
    }

    // Cota de tokens (antes de iniciar o stream SSE). O modelo Pro custa ~3x mais,
    // então exige margem de segurança maior (bloqueia a 70% em vez de 100%).
    const quota = await checkTokenQuota(req as AuthenticatedRequest);
    const pctLimiteSeguro = isComplex ? 70 : 100;
    if (quota.limite != null && quota.pct >= pctLimiteSeguro) {
      return res.status(403).json({
        error: isComplex
          ? 'Saldo de tokens insuficiente para geração com o modelo Pro. Aguarde o próximo ciclo mensal ou contate o suporte.'
          : 'Limite de tokens do modo demonstração atingido para este mês. Contate o suporte para aumentar o limite.',
        code: 'TOKEN_LIMIT_EXCEEDED',
        usado: quota.usado,
        limite: quota.limite,
      });
    }
    if (quota.status === 'warn') {
      res.setHeader('X-Token-Quota-Warning', String(quota.pct));
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Client disconnect cancels the in-flight LLM stream
    req.on('close', abort);

    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ progress: 10, label: 'Gerando embeddings da requisição...' })}\n\n`);

    // Tipagem compartilhada entre a busca vetorial e o fallback por palavras-chave
    let relevantChunks: { texto: string; metadata: unknown; similarity: number }[] = [];

    try {
      const queryText = `${tipo} ${area} ${dadosCaso}`;
      const embedding = await generateEmbedding(queryText, (req as any).user?.id);

      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ progress: 30, label: 'Buscando jurisprudência no RAG...' })}\n\n`);

      // Similarity search (HNSW / cosine distance), SEMPRE escopada ao
      // escritório autenticado; a área da peça é filtro ADICIONAL (Fase 2A).
      relevantChunks = await buscarChunksPorEmbedding(escritorioId, area, embedding);
      // Sem chunks da área indexados (ex.: base sem metadata de área), cai para
      // a busca geral DO MESMO ESCRITÓRIO para nunca devolver resultado vazio.
      if (relevantChunks.length === 0) {
        relevantChunks = await buscarChunksPorEmbedding(escritorioId, null, embedding);
      }
    } catch {
      // Fallback: busca por palavras-chave quando os embeddings estão indisponíveis
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ progress: 30, label: 'Embeddings indisponíveis — usando busca por palavras-chave...' })}\n\n`);

      const stopwords = new Set([
        'de', 'a', 'o', 'e', 'que', 'do', 'da', 'em', 'para', 'com', 'por',
        'um', 'uma', 'no', 'na', 'os', 'as', 'se', 'não', 'nao', '&',
        'ou', 'dos', 'das', 'ao', 'aos', 'à', 'é', 'nos', 'meu', 'minha', 'seu', 'sua'
      ]);

      // Tokens de tipo/área + primeiras ~12 palavras do caso, sem pontuação
      const source = `${tipo} ${area} ${dadosCaso.split(/\s+/).slice(0, 12).join(' ')}`;
      const keywords: string[] = [];
      const seen = new Set<string>();
      for (const rawToken of source.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
        const token = rawToken.trim();
        if (token.length < 3 || seen.has(token) || stopwords.has(token)) continue;
        seen.add(token);
        keywords.push(token);
        if (keywords.length >= 8) break;
      }

      // Fallback mínimo quando nenhuma keyword restar
      const effectiveKeywords = keywords.length > 0 ? keywords : [tipo, area].filter(Boolean);

      // Fallback por palavras-chave escopado ao escritório + área da peça.
      let rows = await buscarChunksPorKeywords(escritorioId, area, effectiveKeywords);

      // Nunca devolve vazio: sem correspondência na área, repete a busca geral
      // (ainda DENTRO do mesmo escritório).
      if (rows.length === 0) {
        rows = await buscarChunksPorKeywords(escritorioId, null, effectiveKeywords);
      }

      relevantChunks = rows;
    }

    const contexto = relevantChunks.map(c => c.texto).join('\n\n');

    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ progress: 50, label: 'Enviando para o modelo Qwen...' })}\n\n`);

    const prompt = `Você é um advogado sênior e parecerista atuando no sistema SmartJuris. Sua função é redigir peças processuais e documentos jurídicos de altíssima qualidade técnica.

DIRETRIZES DE REDAÇÃO E CORREÇÃO (AUTOCORRETOR):
1. Linguagem Jurídica: Utilize o padrão culto da língua portuguesa e o jargão jurídico adequado (ex: vênia, exordial, proêmio). Evite coloquialismos.
2. Correção Gramatical: Atue como um revisor ortográfico implacável. Certifique-se de que há estrita concordância verbal e nominal, regência correta e pontuação impecável.
3. Clareza e Concisão: Apesar da formalidade, evite o "juridiquês" excessivo ou prolixo que dificulte a compreensão do juízo.

Tarefa: Com base na jurisprudência e doutrina fornecidas abaixo, crie uma peça jurídica do tipo "${tipo}" na área "${area}".

Os dados do caso são:
${dadosCaso}
${blocoDados}

Contexto (Precedentes e Leis relevantes):
${contexto}

DIRETRIZES DE FUNDAMENTAÇÃO (RAG):
1. Você receberá blocos de contexto (chunks) contendo teses, jurisprudência e fatos do caso.
2. É OBRIGATÓRIO fundamentar todos os pedidos e alegações exclusivamente nas leis, doutrinas e jurisprudências fornecidas no contexto.
3. Não invente ou alucine precedentes, números de processos ou artigos de lei que não estejam nos documentos de suporte.
4. Se o contexto fornecido for insuficiente para fundamentar uma tese complexa, adicione uma nota ao advogado sugerindo a inclusão de mais documentos comprobatórios.

REGRAS DE FORMAÇÃO DO SISTEMA:
- Retorne APENAS o texto da peça.
- Não inclua saudações, explicações ou texto em Markdown, pois o sistema processará a saída via streaming SSE diretamente para o editor rico.
- Use EXATAMENTE os dados do bloco "DADOS ESTRUTURADOS DO CASO" na qualificação das partes, nos pedidos e nos requerimentos. NÃO deixe espaços em branco ("...", "[...]", "a definir") para dados fornecidos nesse bloco.
- Encerre a peça na fórmula "Termos em que, pede deferimento." SEM adicionar local, data, nome do advogado ou número de OAB ao final — o sistema insere a assinatura do advogado automaticamente na exportação.
${estrutura ? `Estrutura obrigatória da peça (siga EXATAMENTE estas seções, nesta ordem, usando CAIXA ALTA para os títulos de cada seção):
${estrutura}` : ''}`;

    const { stream, modelUsado } = await criarStreamComFallback(isComplex, {
      messages: [
        { role: 'system', content: 'Você é um advogado sênior e parecerista atuando no sistema SmartJuris. Sua função é redigir peças processuais e documentos jurídicos de altíssima qualidade técnica. Não utilize marcação markdown ou asteriscos na redação de forma alguma.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      stream: true,
      stream_options: { include_usage: true },
    }, controller.signal);

    let fullText = '';
    let lastUsage: any = null;
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ progress: 70, label: 'Gerando conteúdo...' })}\n\n`);

    for await (const chunk of stream) {
      if (aborted) break;
      const delta = chunk.choices[0]?.delta?.content || '';
      // Limpa asteriscos do fluxo em tempo real
      const cleanDelta = delta.replace(/\*/g, '');
      fullText += cleanDelta;
      if ((chunk as any).usage) lastUsage = (chunk as any).usage;
      // Option to stream tokens to client if UI supports it
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ token: cleanDelta })}\n\n`);
    }

    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ progress: 100, label: 'Concluído. Aguardando revisão.' })}\n\n`);

    if (lastUsage) {
      await trackTokenUsage((req as any).user?.id, 'rag_generate', modelUsado, {
        prompt_tokens: lastUsage.prompt_tokens,
        completion_tokens: lastUsage.completion_tokens,
      });
    }

    const finalResult = {
      done: true,
      fontes: relevantChunks.map(c => ({
        fonte: (c.metadata as any)?.fonte || 'Jurisprudência Recuperada',
        trecho: c.texto.substring(0, 100) + '...',
        relevancia: Math.round(Number(c.similarity) * 100) / 100,
      })),
      conteudo: fullText,
      prompt,
    };
    
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(finalResult)}\n\n`);
      res.end();
    }
  } catch (err: any) {
    if (!res.writableEnded) {
      console.error('Erro na rota de RAG:', err);
      // Mensagem fixa para o cliente; o erro real fica apenas no log do servidor
      res.write(`data: ${JSON.stringify({ error: 'Falha ao gerar peça. Tente novamente.' })}\n\n`);
      res.end();
    }
  } finally {
    clearTimeout(timeout);
    req.removeListener('close', abort);
  }
});

export default router;
