import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { getApiBaseUrl } from '../api/config'

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
  const [step, setStep] = useState<Step>('tipo')
  const [area, setArea] = useState('Trabalhista')
  const [tipo, setTipo] = useState('')
  const [progresso, setProgresso] = useState(0)
  const [progressoLabel, setProgressoLabel] = useState('')
  const [copied, setCopied] = useState(false)

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

  const etapas = ['Selecionar Tipo', 'Dados do Caso', 'Geração IA', 'Revisão']
  const etapaIndex = ['tipo', 'dados', 'gerando', 'revisao'].indexOf(step)

  // Carrega lista de processos e clientes ao iniciar
  useEffect(() => {
    Promise.all([
      api.processos.list(),
      api.clientes.list()
    ]).then(([pData, cData]) => {
      if (Array.isArray(pData)) setProcessosList(pData)
      if (Array.isArray(cData)) setClientesList(cData)
    }).catch(err => console.error('Erro ao carregar dados:', err))
  }, [])

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

  useEffect(() => {
    if (step === 'gerando') {
      const run = async () => {
        setTextoEmGeracao('');
        try {
          const token = localStorage.getItem('smartjuris_token');
          const apiBase = getApiBaseUrl();
          const response = await fetch(`${apiBase}/api/rag/generate`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ 
              tipo, 
              area, 
              dadosCaso: `${dadosCaso}\n\n[DADOS PROCESSUAIS]: Autor: ${nomeCliente || 'Autor'}, Réu: ${parteAdversa || 'Réu'}, Vara: ${varaTribunal || 'Vara Cível'}, Valor: ${valorCausa || 'A apurar'}.` 
            })
          });

          if (!response.body) throw new Error('No body');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          
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
                
                const data = JSON.parse(dataStr);
                
                if (data.progress !== undefined) {
                  setProgresso(data.progress);
                  setProgressoLabel(data.label);
                }
                if (data.token !== undefined) {
                  setTextoEmGeracao(prev => prev + data.token);
                }
                if (data.done) {
                  setPecaConteudo(data.conteudo);
                  setFontesRecuperadas(data.fontes || []);
                  
                  // Salva a peça no banco
                  await api.pecas.create({
                    processoId: processoSelecionadoId || '',
                    tipo: tipo || 'Petição',
                    area,
                    cliente: nomeCliente || 'Cliente SmartJuris',
                    status: 'revisao',
                    prazo: 'Em análise',
                    modelo: 'DeepSeek Chat (RAG BGE-M3)',
                    fontes: data.fontes?.length || 3,
                    conteudo: data.conteudo,
                  });
                  setTimeout(() => setStep('revisao'), 800);
                }
              }
            }
          }
        } catch (e) {
          console.error('Erro na geração', e);
          setProgressoLabel('Erro na geração!');
        }
      }
      run()
    }
  }, [step, tipo, area])

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>Gerar Peça Processual</div>
        <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>Motor RAG jurídico · BGE-M3 · DeepSeek Chat · Validação Auditável</div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36, gap: 0 }}>
        {etapas.map((e, i) => (
          <div key={e} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: i < etapaIndex ? 'var(--color-success)' : i === etapaIndex ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: i <= etapaIndex ? '#fff' : 'var(--color-muted)',
                border: i === etapaIndex ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}>
                {i < etapaIndex ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 12, fontWeight: i === etapaIndex ? 600 : 400, color: i === etapaIndex ? 'var(--color-foreground)' : 'var(--color-muted)' }}>{e}</span>
            </div>
            {i < etapas.length - 1 && (
              <div style={{ width: 48, height: 1, background: i < etapaIndex ? 'var(--color-success)' : 'var(--color-border)', margin: '0 12px' }}/>
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Tipo */}
      {step === 'tipo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Seletor Rápido de Processo Vinculado */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary)' }}>
                ⚡ Automação: Vincular a um Processo Cadastrado
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                Preenche automaticamente partes, juízo e comarca em 1 clique.
              </div>
            </div>
            <select
              value={processoSelecionadoId}
              onChange={e => handleSelectProcesso(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)',
                background: 'var(--color-background)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none'
              }}
            >
              <option value="">-- Selecionar Processo (Opcional) --</option>
              {processosList.map(p => (
                <option key={p.id} value={p.id}>
                  {p.cliente} vs. {p.adverso} ({p.area})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>Área do Direito</div>
              {areas.map(a => (
                <button key={a} onClick={() => { setArea(a); setTipo('') }} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 14px', marginBottom: 4, borderRadius: 6,
                  border: '1px solid', cursor: 'pointer',
                  borderColor: area === a ? 'var(--color-primary)' : 'var(--color-border)',
                  background: area === a ? '#eef0f7' : 'var(--color-surface)',
                  color: area === a ? 'var(--color-primary)' : 'var(--color-foreground)',
                  fontWeight: area === a ? 600 : 400, fontSize: 13,
                }}>{a}</button>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>Tipo de Peça — {area}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(tiposPorArea[area] || []).map(t => (
                  <button key={t} onClick={() => setTipo(t)} style={{
                    padding: '16px 18px', borderRadius: 8, textAlign: 'left',
                    border: '1px solid', cursor: 'pointer',
                    borderColor: tipo === t ? 'var(--color-primary)' : 'var(--color-border)',
                    background: tipo === t ? '#eef0f7' : 'var(--color-surface)',
                    color: tipo === t ? 'var(--color-primary)' : 'var(--color-foreground)',
                    fontWeight: tipo === t ? 600 : 400, fontSize: 13,
                    transition: 'all 0.12s',
                  }}>{t}</button>
                ))}
              </div>

              {/* Playbooks / Teses Rápidas Sugeridas */}
              {tesesPlaybook[area] && tesesPlaybook[area].length > 0 && (
                <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>
                    📚 Modelos de Teses Frequentes (Playbooks do Escritório)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {tesesPlaybook[area].map((tese, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          handleApplyTese(tese)
                          setStep('dados')
                        }}
                        style={{
                          background: 'var(--color-surface)', border: '1px solid var(--color-accent)',
                          color: 'var(--color-foreground)', padding: '6px 12px', borderRadius: 6,
                          fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                        }}
                      >
                        {tese.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 24 }}>
                <button
                  disabled={!tipo}
                  onClick={() => setStep('dados')}
                  style={{
                    background: tipo ? 'var(--color-primary)' : 'var(--color-border)',
                    color: '#fff', border: 'none',
                    padding: '11px 28px', borderRadius: 6,
                    fontSize: 13, fontWeight: 600, cursor: tipo ? 'pointer' : 'not-allowed',
                  }}>Continuar →</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Dados */}
      {step === 'dados' && (
        <div style={{ maxWidth: 720 }}>
          <div style={{ background: 'var(--color-accent-light)', border: '1px solid var(--color-accent)', borderRadius: 6, padding: '12px 16px', marginBottom: 24, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Peça configurada:</strong> {tipo || 'Petição'} · Área {area}
            </div>
            {nomeCliente && (
              <span style={{ fontSize: 11, background: 'var(--color-surface)', padding: '3px 8px', borderRadius: 4 }}>
                Vinculado a: <strong>{nomeCliente}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>Número do Processo</label>
              <input
                placeholder="0001234-56.2026.5.02.0001"
                value={numeroProcesso}
                onChange={e => setNumeroProcesso(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6,
                  fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>Vara / Juízo / Tribunal</label>
              <input
                placeholder="3ª Vara do Trabalho de São Paulo/SP"
                value={varaTribunal}
                onChange={e => setVaraTribunal(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6,
                  fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>Nome do Autor / Cliente (Autocomplete)</label>
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
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6,
                  fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none',
                }}
              />
              <datalist id="clientes-datalist">
                {clientesList.map(c => (
                  <option key={c.id} value={c.nome}>{c.nome} ({c.cpfCnpj})</option>
                ))}
              </datalist>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>Nome do Réu / Adverso</label>
              <input
                placeholder="Empresa XYZ S.A."
                value={parteAdversa}
                onChange={e => setParteAdversa(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6,
                  fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 5 }}>Valor da Causa</label>
              <input
                placeholder="R$ 87.500,00"
                value={valorCausa}
                onChange={e => setValorCausa(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6,
                  fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                  Fatos do Caso e Fundamentação
                </label>
                {tesesPlaybook[area] && (
                  <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 500 }}>
                    💡 Dica: Playbooks disponíveis
                  </span>
                )}
              </div>
              <textarea 
                value={dadosCaso}
                onChange={e => setDadosCaso(e.target.value)}
                placeholder="Descreva os fatos relevantes, pedidos específicos, valores a serem cobrados ou selecione um playbook..." 
                rows={5} 
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6,
                  fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-foreground)', outline: 'none',
                  resize: 'vertical', fontFamily: 'var(--font-sans)', lineHeight: 1.5
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('tipo')} style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 13, cursor: 'pointer' }}>← Voltar</button>
            <button 
              disabled={!dadosCaso.trim()} 
              onClick={() => setStep('gerando')} 
              style={{ 
                background: dadosCaso.trim() ? 'var(--color-primary)' : 'var(--color-border)', 
                color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 6, 
                fontSize: 13, fontWeight: 600, cursor: dadosCaso.trim() ? 'pointer' : 'not-allowed' 
              }}
            >
              Gerar Peça com RAG e IA →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Gerando */}
      {step === 'gerando' && (
        <div style={{ maxWidth: 800 }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '32px' }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 24 }}>Consultando Base RAG & Gerando Minuta...</div>

            <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'var(--color-primary)',
                width: `${progresso}%`,
                transition: 'width 0.6s ease',
              }}/>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)', marginBottom: 28, display: 'flex', justifyContent: 'space-between' }}>
              <span>{progressoLabel}</span>
              {progresso >= 50 && <span style={{ color: 'var(--color-accent)' }}>Recebendo stream da IA...</span>}
            </div>

            {textoEmGeracao && (
              <div style={{
                marginTop: 20, marginBottom: 20, padding: 20,
                background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 6,
                maxHeight: 300, overflowY: 'auto',
                fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--color-foreground)',
                whiteSpace: 'pre-wrap'
              }}>
                {textoEmGeracao}
                <span style={{ display: 'inline-block', width: 6, height: 12, background: 'var(--color-primary)', marginLeft: 4, animation: 'blink 1s step-start infinite' }} />
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.6, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
              🔍 <strong>Pipeline ativo:</strong> Ingestão semântica ➔ Embeddings BGE-M3 ➔ Busca vetorial no pgvector ➔ Síntese DeepSeek Chat ➔ Validação anti-alucinação.
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Revisão */}
      {step === 'revisao' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--color-warning-light)', color: 'var(--color-warning)', padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase' }}>
                Aguardando Revisão Humana
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {fontesRecuperadas.length} fontes consultadas na base
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(pecaConteudo)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                style={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                {copied ? '✓ Copiado!' : '📋 Copiar Texto'}
              </button>
              <button 
                onClick={() => {
                  setStep('tipo')
                  setDadosCaso('')
                  setProcessoSelecionadoId('')
                }}
                style={{
                  background: 'var(--color-primary)', color: '#fff', border: 'none',
                  padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}
              >
                + Nova Peça
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
            <div style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 8, padding: 32, fontFamily: 'var(--font-sans)', fontSize: 14,
              lineHeight: 1.7, color: 'var(--color-foreground)', whiteSpace: 'pre-wrap', maxHeight: '650px', overflowY: 'auto'
            }}>
              {pecaConteudo}
            </div>

            {/* Painel Lateral: Fontes e Conformidade */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', marginBottom: 10 }}>
                  🛡️ Conformidade & Rastreabilidade
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                  Minuta registrada na trilha de auditoria e enviada para o módulo de <strong>Validação</strong>.
                </div>
              </div>

              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)', marginBottom: 10 }}>
                  📚 Precedentes & Súmulas Ancorados
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fontesRecuperadas.map((f, i) => (
                    <div key={i} style={{ padding: 8, background: 'var(--color-background)', borderRadius: 4, fontSize: 11 }}>
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
    </div>
  )
}
