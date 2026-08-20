import { useState, useEffect } from 'react'
import { api, getErrorMessage, Decision } from '../api/client'
import { getApiBaseUrl } from '../api/config'
import Toast, { ToastMessage } from './Toast'
import Decisoes from './Decisoes'
import EditorRico, { plainToHtml } from './EditorRico'
import { Button, FONT, Field, inputStyle, Modal, PageContainer, PageHeader, RADIUS, SPACE, useIsMobile } from '../ui'

type Step = 'tipo' | 'dados' | 'gerando' | 'revisao'

const areas = ['Cível', 'Trabalhista', 'Tributário', 'Penal', 'Previdenciário', 'Consumerista']

const tiposPorArea: Record<string, string[]> = {
  'Cível': ['Petição Inicial', 'Contestação', 'Réplica', 'Recurso de Apelação', 'Agravo de Instrumento', 'Embargos de Declaração', 'Impugnação ao Cumprimento de Sentença'],
  'Trabalhista': ['Reclamação Trabalhista', 'Contestação Trabalhista', 'Recurso Ordinário', 'Recurso de Revista', 'Agravo de Petição'],
  'Tributário': ['Mandado de Segurança Tributário', 'Ação Anulatória', 'Ação de Repetição de Indébito', 'Embargos à Execução Fiscal'],
  'Penal': ['Queixa-Crime', 'Resposta à Acusação', 'Memoriais', 'Habeas Corpus', 'Apelação Criminal'],
  'Previdenciário': ['Ação de Concessão de Benefício', 'Revisão de Benefício', 'Recurso ao CRPS'],
  'Consumerista': ['Petição Inicial CDC', 'Ação de Danos Morais', 'Ação de Obrigação de Fazer'],
}

// Teses Rápidas / Playbooks por Área
const tesesPlaybook: Record<string, { label: string; texto: string; tipo: string }[]> = {
  'Trabalhista': [
    {
      label: '⚡ Horas Extras & Intervalo Intrajornada',
      tipo: 'Reclamação Trabalhista',
      texto: 'O Reclamante cumpria jornada extraordinária de 2 horas diárias além da 8ª diária, sem intervalo intrajornada regular (apenas 20 min). Requer o pagamento de horas extras com adicional de 50%, reflexos em DSR, férias + 1/3, 13º e FGTS com multa de 40% (Art. 71 e 59 CLT).'
    },
    {
      label: '⚡ Rescisão Indireta por Falta de FGTS',
      tipo: 'Reclamação Trabalhista',
      texto: 'A Reclamada deixou de recolher o FGTS por mais de 8 meses consecutivos e atrasava reiteradamente o pagamento dos salários. Requer a declaração da rescisão indireta do contrato de trabalho nos termos do art. 483, "d", da CLT com liberação de guias e verbas rescisórias integrais.'
    },
  ],
  'Consumerista': [
    {
      label: '⚡ Extravio de Bagagem / Voo Cancelado',
      tipo: 'Ação de Danos Morais',
      texto: 'Cancelamento injustificado de voo internacional com atraso de 28 horas na chegada ao destino final e extravio temporário de bagagem por 4 dias. Requer indenização por danos morais no importe de R$ 15.000,00 e restituição de despesas emergenciais (CDC, arts. 6º, VI e 14).'
    },
    {
      label: '⚡ Negativação Indevida no SPC/Serasa',
      tipo: 'Petição Inicial CDC',
      texto: 'Inscrição indevida do nome do Autor nos órgãos de proteção ao crédito por dívida inexistente/já quitada. Requer tutela de urgência para baixa imediata do gravame e condenação em danos morais in re ipsa (Súmula 385 STJ a contrario sensu).'
    },
  ],
  'Cível': [
    {
      label: '⚡ Ação de Cobrança / Título Extrajudicial',
      tipo: 'Petição Inicial',
      texto: 'Cobrança fundada em contrato de prestação de serviços inadimplido, com notas fiscais devidamente atestadas e comprovante de entrega dos serviços. Requer citação para pagamento em 3 dias sob pena de penhora (Art. 829 CPC).'
    },
    {
      label: '⚡ Contestação por Inadimplemento Contratual',
      tipo: 'Contestação',
      texto: 'Defesa baseada na exceção do contrato não cumprido (art. 476 do Código Civil). O Autor não entregou a contraprestação pactuada dentro do prazo e com as especificações contratadas, justificando a retenção legítima dos pagamentos.'
    }
  ],
  'Previdenciário': [
    {
      label: '⚡ Aposentadoria Especial / Conversão PPP (Lei 8.213/91)',
      tipo: 'Ação de Concessão de Benefício',
      texto: 'O Segurado trabalhou por mais de 25 anos exposto de forma habitual e permanente a agentes nocivos (ruído acima de 85 dB e hidrocarbonetos), conforme comprovado por Perfil Profissiográfico Previdenciário (PPP) e LTCAT. Requer o reconhecimento do tempo especial, a conversão do período e a imediata concessão da Aposentadoria Especial com pagamento das parcelas vencidas desde a DER (Lei 8.213/91, art. 57).'
    },
    {
      label: '⚡ Restabelecimento de Auxílio-Incapacidade / Perícia Judicial',
      tipo: 'Ação de Concessão de Benefício',
      texto: 'Cessação indevida de benefício por incapacidade temporária (antigo auxílio-doença) pelo INSS sem a efetiva recuperação da capacidade laboral do Segurado. Requer a realização de perícia médica judicial por perito ortopedista/especialista e o restabelecimento imediato do benefício com tutela provisória de urgência.'
    },
    {
      label: '⚡ Revisão de Benefício Previdenciário / RMI',
      tipo: 'Revisão de Benefício',
      texto: 'O cálculo da Renda Mensal Inicial (RMI) pelo INSS não computou corretamente os salários de contribuição e verbas reconhecidas em reclamação trabalhista transitada em julgado. Requer a revisão do valor do benefício mantido, a retificação do CNIS e o pagamento das diferenças retroativas respeitada a prescrição quinquenal.'
    }
  ]
}

export default function GeradorPecas() {
  const isMobile = useIsMobile()
  const [step, setStep] = useState<Step>('tipo')
  const [area, setArea] = useState('Trabalhista')
  const [tipo, setTipo] = useState('')
  const [progresso, setProgresso] = useState(0)
  const [progressoLabel, setProgressoLabel] = useState('')
  const [copied, setCopied] = useState(false)

  // Sistema de Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = String(Date.now())
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  // Lista de processos e clientes para vinculo e autocomplete
  const [processosList, setProcessosList] = useState<any[]>([])
  const [clientesList, setClientesList] = useState<any[]>([])
  const [processoSelecionadoId, setProcessoSelecionadoId] = useState('')

  // Campos do formulário
  const [numeroProcesso, setNumeroProcesso] = useState('')
  const [varaTribunal, setVaraTribunal] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const [cpfCliente, setCpfCliente] = useState('')
  const [parteAdversa, setParteAdversa] = useState('')
  const [cnpjAdverso, setCnpjAdverso] = useState('')
  const [valorCausa, setValorCausa] = useState('')

  const [dadosCaso, setDadosCaso] = useState('')
  const [pecaConteudo, setPecaConteudo] = useState('')
  const [textoEmGeracao, setTextoEmGeracao] = useState('')
  const [fontesRecuperadas, setFontesRecuperadas] = useState<any[]>([])

  // Catálogo de modelos do RAG e edição rica da peça
  const [modelos, setModelos] = useState<any[]>([])
  const [pecaSalvaId, setPecaSalvaId] = useState('')
  const [editJson, setEditJson] = useState<any>(null)

  const etapas = ['Selecionar Tipo', 'Dados do Caso', 'Geração IA', 'Revisão']
  const etapaIndex = ['tipo', 'dados', 'gerando', 'revisao'].indexOf(step)

  // Catálogo de modelos: tipos por área vêm da API (cada item tem `.tipo` e `.modelo`).
  const areaCatalogo = modelos.find(a => a.nome === area)
  const tiposDaArea: any[] = (areaCatalogo?.tipos && areaCatalogo.tipos.length > 0)
    ? areaCatalogo.tipos
    : (tiposPorArea[area] || []).map(t => ({ tipo: t }))
  const modeloSelecionado = areaCatalogo?.tipos?.find((t: any) => t.tipo === tipo)?.modelo

  // Carrega lista de processos, clientes e catálogo de modelos ao iniciar
  useEffect(() => {
    Promise.all([
      api.processos.list(),
      api.clientes.list(),
      api.rag.modelos(),
    ]).then(([pData, cData, mData]) => {
      if (Array.isArray(pData)) setProcessosList(pData)
      if (Array.isArray(cData)) setClientesList(cData)
      const areas = (mData as any)?.areas
      if (Array.isArray(areas)) setModelos(areas)
    }).catch(err => console.error('Erro ao carregar dados:', err))
  }, [])

  const [showDecisoesModal, setShowDecisoesModal] = useState(false)

  // Importa jurisprudência selecionada da busca externa
  useEffect(() => {
    try {
      const stored = localStorage.getItem('smartjuris_selected_jurisprudencia')
      if (stored) {
        const arr: Decision[] = JSON.parse(stored)
        if (arr.length > 0) {
          const item = arr[arr.length - 1]
          const citation = `\n\n[JURISPRUDÊNCIA / PRECEDENTE - ${item.court?.toUpperCase() || 'TRIBUNAL'}]:\n${item.process_type || 'Decisão'} nº ${item.process_number} (Rel. ${item.rapporteur || 'N/A'}, Julg. ${item.trial_date || 'N/A'})\nEmenta: "${item.excerpt || item.summary || ''}"`
          setDadosCaso(prev => prev.includes(item.process_number) ? prev : (prev ? prev + citation : citation))
          localStorage.removeItem('smartjuris_selected_jurisprudencia')
          addToast('info', `Jurisprudência do ${item.court?.toUpperCase() || 'Tribunal'} anexada ao caso.`)
        }
      }
    } catch (e) {
      console.warn(e)
    }
  }, [])

  const handleSelectJurisprudenciaParaCaso = (d: Decision) => {
    const citation = `\n\n[JURISPRUDÊNCIA / PRECEDENTE - ${d.court?.toUpperCase() || 'TRIBUNAL'}]:\n${d.process_type || 'Decisão'} nº ${d.process_number} (Rel. ${d.rapporteur || 'N/A'}, Julg. ${d.trial_date || 'N/A'})\nEmenta: "${d.excerpt || d.summary || ''}"`
    setDadosCaso(prev => prev.includes(d.process_number) ? prev : (prev ? prev + citation : citation))
    setShowDecisoesModal(false)
    addToast('success', 'Jurisprudência anexada aos fatos e fundamentação!')
  }

  // Quando o usuário seleciona um processo, preenche os campos automaticamente
  const handleSelectProcesso = (procId: string) => {
    setProcessoSelecionadoId(procId)
    const proc = processosList.find(p => p.id === procId)
    if (proc) {
      if (proc.area && areas.includes(proc.area)) setArea(proc.area)
      setNomeCliente(proc.cliente || '')
      setParteAdversa(proc.adverso || '')
      setVaraTribunal(proc.vara || '')
      setValorCausa(proc.valor || '')
      setNumeroProcesso(`000${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10 + Math.random() * 89)}.2026.5.02.0001`)
    }
  }

  // Preenche tese rápida
  const handleApplyTese = (tese: { label: string; texto: string; tipo: string }) => {
    if (tese.tipo) setTipo(tese.tipo)
    setDadosCaso(tese.texto)
  }

  const handleBaixar = async (format: 'pdf' | 'docx') => {
    if (!pecaSalvaId) return
    try {
      await api.pecas.export(pecaSalvaId, format)
    } catch (e) {
      console.error(e)
      addToast('error', 'Falha ao baixar o arquivo.')
    }
  }

  const handleSalvarEdicoes = async () => {
    if (!pecaSalvaId || !editJson) return
    try {
      const res = await api.pecas.update(pecaSalvaId, { conteudoRico: editJson })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao salvar edições.'))
        return
      }
      addToast('success', 'Edições salvas.')
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao salvar edições.')
    }
  }

  useEffect(() => {
    if (step === 'gerando') {
      const run = async () => {
        setTextoEmGeracao('');
        setPecaSalvaId('');
        setEditJson(null);
        try {
          const apiBase = getApiBaseUrl();
          const response = await fetch(`${apiBase}/api/rag/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
              tipo, 
              area, 
              dadosCaso: `${dadosCaso}\n\n[DADOS PROCESSUAIS]: Autor: ${nomeCliente || 'Autor'}, Réu: ${parteAdversa || 'Réu'}, Vara: ${varaTribunal || 'Vara Cível'}, Valor: ${valorCausa || 'A apurar'}.` 
            })
          });

          if (!response.ok) {
            let msg = 'Falha ao gerar peça. Tente novamente.'
            try {
              const errData = await response.clone().json()
              if (typeof errData?.error === 'string' && errData.error) msg = errData.error
            } catch { /* corpo não-JSON: mantém mensagem padrão */ }
            throw new Error(msg)
          }

          if (!response.body) throw new Error('No body');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          
          // Acumulador com flush throttled (50ms) para não re-renderizar a cada token.
          let acc = '';
          let lastFlush = 0;
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.substring(6).trim();
                if (!dataStr) continue;
                
                let data: any;
                try {
                  data = JSON.parse(dataStr);
                } catch {
                  // Linha SSE malformada: ignora e continua o stream
                  continue;
                }
                
                if (data.progress !== undefined) {
                  setProgresso(data.progress);
                  setProgressoLabel(data.label);
                }
                if (data.token !== undefined) {
                  acc += data.token;
                  const now = Date.now();
                  if (now - lastFlush >= 50) {
                    setTextoEmGeracao(acc);
                    lastFlush = now;
                  }
                }
                if (data.done) {
                  // Flush final do acumulador antes de consolidar a peça.
                  setTextoEmGeracao(acc);
                  setPecaConteudo(data.conteudo);
                  setFontesRecuperadas(data.fontes || []);
                  
                  // Salva a peça no banco
                  const res = await api.pecas.create({
                    processoId: processoSelecionadoId || '',
                    tipo: tipo || 'Petição',
                    area,
                    cliente: nomeCliente || 'Cliente SmartJuris',
                    status: 'revisao',
                    prazo: new Date().toISOString().slice(0, 10),
                    modelo: 'DeepSeek Chat (RAG BGE-M3)',
                    fontes: data.fontes?.length || 3,
                    conteudo: data.conteudo,
                  });
                  if (!res.ok) {
                    throw new Error(await getErrorMessage(res, 'Erro ao salvar a peça gerada.'));
                  }
                  const created = await res.json().catch(() => ({}));
                  setPecaSalvaId(created?.id ?? '');
                  setTimeout(() => setStep('revisao'), 800);
                }
              }
            }
          }
        } catch (e: any) {
          console.error('Erro na geração', e);
          const msg = e?.message || 'Erro na geração da peça. Tente novamente.';
          setProgressoLabel(msg);
          addToast('error', msg);
          // Volta para o passo de dados para o usuário poder corrigir e tentar novamente
          setProgresso(0);
          setStep('dados');
        }
      }
      run()
    }
  }, [step, tipo, area])

  return (
    <PageContainer>
      <PageHeader
        eyebrow="GERAÇÃO DE PEÇAS COM IA"
        title="Gerar Peça Processual"
        description="Motor RAG jurídico · BGE-M3 · DeepSeek Chat · Validação Auditável"
      />

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36, gap: 0, flexWrap: 'wrap' }}>
        {etapas.map((e, i) => (
          <div key={e} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: FONT.sm, fontWeight: 700,
                background: i < etapaIndex ? 'var(--color-success)' : i === etapaIndex ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: i <= etapaIndex ? 'var(--color-on-primary)' : 'var(--color-muted)',
                border: i === etapaIndex ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}>
                {i < etapaIndex ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: FONT.base, fontWeight: i === etapaIndex ? 600 : 400, color: i === etapaIndex ? 'var(--color-foreground)' : 'var(--color-muted)' }}>{e}</span>
            </div>
            {i < etapas.length - 1 && (
              <div style={{ width: 48, height: 1, background: i < etapaIndex ? 'var(--color-success)' : 'var(--color-border)', margin: '0 12px' }}/>
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Tipo */}
      {step === 'tipo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xxl }}>
          {/* Seletor Rápido de Processo Vinculado */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.lg, flexWrap: isMobile ? 'wrap' : undefined }}>
            <div>
              <div style={{ fontSize: FONT.base, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary)' }}>
                ⚡ Automação: Vincular a um Processo Cadastrado
              </div>
              <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginTop: 2 }}>
                Preenche automaticamente partes, juízo e comarca em 1 clique.
              </div>
            </div>
            <select
              value={processoSelecionadoId}
              onChange={e => handleSelectProcesso(e.target.value)}
              style={{ ...inputStyle(), width: isMobile ? '100%' : 'auto', minWidth: isMobile ? undefined : 280, background: 'var(--color-background)' }}
            >
              <option value="">-- Selecionar Processo (Opcional) --</option>
              {processosList.map(p => (
                <option key={p.id} value={p.id}>
                  {p.cliente} vs. {p.adverso} ({p.area})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '240px 1fr', gap: SPACE.xxl }}>
            <div>
              <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>Área do Direito</div>
              {areas.map(a => (
                <Button
                  key={a}
                  size="md"
                  variant="secondary"
                  onClick={() => { setArea(a); setTipo('') }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', justifyContent: 'flex-start',
                    padding: '9px 14px', marginBottom: 4,
                    borderColor: area === a ? 'var(--color-primary)' : 'var(--color-border)',
                    background: area === a ? 'var(--color-badge-tint)' : 'var(--color-surface)',
                    color: area === a ? 'var(--color-primary)' : 'var(--color-foreground)',
                    fontWeight: area === a ? 600 : 400,
                  }}
                >{a}</Button>
              ))}
            </div>

            <div>
              <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>Tipo de Peça — {area}</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                {tiposDaArea.map(t => {
                  const tName = t.tipo ?? t
                  return (
                    <Button
                      key={tName}
                      size="md"
                      variant="secondary"
                      onClick={() => setTipo(tName)}
                      style={{
                        padding: '16px 18px', borderRadius: RADIUS.card, textAlign: 'left', justifyContent: 'flex-start',
                        borderColor: tipo === tName ? 'var(--color-primary)' : 'var(--color-border)',
                        background: tipo === tName ? 'var(--color-badge-tint)' : 'var(--color-surface)',
                        color: tipo === tName ? 'var(--color-primary)' : 'var(--color-foreground)',
                        fontWeight: tipo === tName ? 600 : 400,
                        transition: 'all 0.12s',
                      }}
                    >{tName}</Button>
                  )
                })}
              </div>

              {/* Prévia da estrutura do modelo selecionado */}
              {modeloSelecionado && (
                <div style={{ marginTop: 18, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '16px 18px' }}>
                  <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>
                    📚 Estrutura do modelo
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(modeloSelecionado.secoes || []).map((s: any, idx: number) => (
                      <div key={idx} style={{ fontSize: FONT.base, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{s.titulo}</div>
                        {s.instrucao && <div style={{ color: 'var(--color-muted)', fontSize: FONT.sm, marginTop: 2 }}>{s.instrucao}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Playbooks / Teses Rápidas Sugeridas */}
              {tesesPlaybook[area] && tesesPlaybook[area].length > 0 && (
                <div style={{ marginTop: SPACE.xxl, paddingTop: 18, borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>
                    📚 Modelos de Teses Frequentes (Modelos do Escritório)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {tesesPlaybook[area].map((tese, idx) => (
                      <Button
                        key={idx}
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          handleApplyTese(tese)
                          setStep('dados')
                        }}
                        style={{ borderColor: 'var(--color-accent)', color: 'var(--color-foreground)' }}
                      >
                        {tese.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: SPACE.xxl }}>
                <Button size="md" disabled={!tipo} onClick={() => setStep('dados')}>Continuar →</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Dados */}
      {step === 'dados' && (
        <div style={{ maxWidth: 720 }}>
          <div style={{ background: 'var(--color-accent-light)', border: '1px solid var(--color-accent)', borderRadius: RADIUS.control, padding: '12px 16px', marginBottom: SPACE.xxl, fontSize: FONT.base, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.sm }}>
            <div>
              <strong>Peça configurada:</strong> {tipo || 'Petição'} · Área {area}
            </div>
            {nomeCliente && (
              <span style={{ fontSize: FONT.sm, background: 'var(--color-surface)', padding: '3px 8px', borderRadius: RADIUS.chip }}>
                Vinculado a: <strong>{nomeCliente}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Número do Processo">
                <input
                  placeholder="0001234-56.2026.5.02.0001"
                  value={numeroProcesso}
                  onChange={e => setNumeroProcesso(e.target.value)}
                  style={{ ...inputStyle(), fontFamily: 'var(--font-mono)' }}
                />
              </Field>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Vara / Juízo / Tribunal">
                <input
                  placeholder="3ª Vara do Trabalho de São Paulo/SP"
                  value={varaTribunal}
                  onChange={e => setVaraTribunal(e.target.value)}
                  style={inputStyle()}
                />
              </Field>
            </div>

            <div>
              <Field label="Nome do Autor / Cliente (Autocomplete)">
                <input
                  list="clientes-datalist"
                  placeholder="Digite o nome ou selecione um cliente..."
                  value={nomeCliente}
                  onChange={e => {
                    const val = e.target.value
                    setNomeCliente(val)
                    const found = clientesList.find(c => c.nome === val)
                    if (found) {
                      setCpfCliente(found.cpfCnpj || '')
                      if (found.qualificacao) {
                        setDadosCaso(prev => prev ? `${prev}\n\n[QUALIFICAÇÃO DO CLIENTE]: ${found.qualificacao}` : `[QUALIFICAÇÃO DO CLIENTE]: ${found.qualificacao}`)
                      }
                    }
                  }}
                  style={inputStyle()}
                />
                <datalist id="clientes-datalist">
                  {clientesList.map(c => (
                    <option key={c.id} value={c.nome}>{c.nome} ({c.cpfCnpj})</option>
                  ))}
                </datalist>
              </Field>
            </div>

            <div>
              <Field label="Nome do Réu / Adverso">
                <input
                  placeholder="Empresa XYZ S.A."
                  value={parteAdversa}
                  onChange={e => setParteAdversa(e.target.value)}
                  style={inputStyle()}
                />
              </Field>
            </div>

            <div>
              <Field label="Valor da Causa">
                <input
                  placeholder="R$ 87.500,00"
                  value={valorCausa}
                  onChange={e => setValorCausa(e.target.value)}
                  style={{ ...inputStyle(), fontFamily: 'var(--font-mono)' }}
                />
              </Field>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, flexWrap: 'wrap', gap: SPACE.sm }}>
                <label style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-muted)' }}>
                  Fatos do Caso e Fundamentação
                </label>
                <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowDecisoesModal(true)}
                    style={{ borderColor: 'var(--color-accent)', color: 'var(--color-primary)' }}
                  >
                    🏛️ Pesquisar Decisões nos Tribunais
                  </Button>
                  {tesesPlaybook[area] && (
                    <span style={{ fontSize: FONT.sm, color: 'var(--color-accent)', fontWeight: 500 }}>
                      💡 Dica: Modelos disponíveis
                    </span>
                  )}
                </div>
              </div>
              <textarea 
                value={dadosCaso}
                onChange={e => setDadosCaso(e.target.value)}
                placeholder="Descreva os fatos relevantes, pedidos específicos, valores a serem cobrados ou selecione um modelo..." 
                rows={5} 
                style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>
          </div>

          <div style={{ marginTop: SPACE.xxl, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setStep('tipo')}>← Voltar</Button>
            <Button
              disabled={!dadosCaso.trim()}
              onClick={() => setStep('gerando')}
            >
              Gerar Peça com RAG e IA →
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Gerando */}
      {step === 'gerando' && (
        <div style={{ maxWidth: 800 }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: 32 }}>
            <div style={{ fontWeight: 600, fontSize: FONT.lg, marginBottom: SPACE.xxl }}>Consultando Base RAG & Gerando Minuta...</div>

            <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden', marginBottom: SPACE.md }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'var(--color-primary)',
                width: `${progresso}%`,
                transition: 'width 0.6s ease',
              }}/>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: 'var(--color-muted)', marginBottom: 28, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.sm }}>
              <span>{progressoLabel}</span>
              {progresso >= 50 && <span style={{ color: 'var(--color-accent)' }}>Recebendo stream da IA...</span>}
            </div>

            {textoEmGeracao && (
              <div style={{
                marginTop: SPACE.xl, marginBottom: SPACE.xl, padding: SPACE.xl,
                background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: RADIUS.control,
                maxHeight: 300, overflowY: 'auto',
                fontFamily: 'var(--font-mono)', fontSize: FONT.base, lineHeight: 1.6, color: 'var(--color-foreground)',
                whiteSpace: 'pre-wrap'
              }}>
                {textoEmGeracao}
                <span style={{ display: 'inline-block', width: 6, height: 12, background: 'var(--color-primary)', marginLeft: 4, animation: 'blink 1s step-start infinite' }} />
              </div>
            )}

            <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.6, borderTop: '1px solid var(--color-border)', paddingTop: SPACE.lg }}>
              🔍 <strong>Pipeline ativo:</strong> Ingestão semântica ➔ Embeddings BGE-M3 ➔ Busca vetorial no pgvector ➔ Síntese DeepSeek Chat ➔ Validação anti-alucinação.
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Revisão */}
      {step === 'revisao' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg, flexWrap: 'wrap', gap: SPACE.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: FONT.sm, fontWeight: 700, background: 'var(--color-warning-light)', color: 'var(--color-warning)', padding: '3px 8px', borderRadius: RADIUS.chip, textTransform: 'uppercase' }}>
                Aguardando Revisão Humana
              </span>
              <span style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>
                {fontesRecuperadas.length} fontes consultadas na base
              </span>
            </div>

            <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(pecaConteudo)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? '✓ Copiado!' : '📋 Copiar Texto'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleBaixar('pdf')}
                disabled={!pecaSalvaId}
              >
                Baixar PDF
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleBaixar('docx')}
                disabled={!pecaSalvaId}
              >
                Baixar DOCX
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSalvarEdicoes}
                disabled={!pecaSalvaId || !editJson}
                style={{ background: 'var(--color-success)', color: 'var(--color-on-primary)', borderColor: 'var(--color-success)' }}
              >
                Salvar edições
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setStep('tipo')
                  setDadosCaso('')
                  setProcessoSelecionadoId('')
                  setPecaSalvaId('')
                  setEditJson(null)
                }}
              >
                + Nova Peça
              </Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: SPACE.xxl, alignItems: 'start' }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: SPACE.xl }}>
              <EditorRico
                initialContent={editJson ?? plainToHtml(pecaConteudo)}
                onChange={setEditJson}
                minHeight={420}
              />
            </div>

            {/* Painel Lateral: Fontes e Conformidade */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: 18 }}>
                <div style={{ fontSize: FONT.sm, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', marginBottom: 10 }}>
                  🛡️ Conformidade & Rastreabilidade
                </div>
                <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                  Minuta registrada na trilha de auditoria e enviada para o módulo de <strong>Validação</strong>.
                </div>
              </div>

              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: 18 }}>
                <div style={{ fontSize: FONT.sm, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', marginBottom: 10 }}>
                  📚 Precedentes & Súmulas Ancorados
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fontesRecuperadas.map((f, i) => (
                    <div key={i} style={{ padding: 8, background: 'var(--color-background)', borderRadius: RADIUS.chip, fontSize: FONT.sm }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{f.nome || `Fonte #${i+1}`}</div>
                      <div style={{ color: 'var(--color-muted)', marginTop: 2 }}>{f.colecao || 'Legislação & Jurisprudência'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Pesquisa de Decisões dos Tribunais */}
      <Modal
        open={showDecisoesModal}
        onClose={() => setShowDecisoesModal(false)}
        title="Pesquisar Jurisprudência nos Tribunais"
        width={1050}
      >
        <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginBottom: SPACE.lg }}>
          Busque decisões nos 16 tribunais e clique em "Usar na Peça" para anexar aos fatos
        </div>
        <Decisoes onSelectForPeca={handleSelectJurisprudenciaParaCaso} />
      </Modal>

      {/* Componente Toast de Mensageria Flutuante */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </PageContainer>
  )
}
