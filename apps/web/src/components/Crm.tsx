import { useState } from 'react'

interface Lead {
  id: string
  nome: string
  area: string
  valorEstimado: string
  contato: string
  fase: 'lead' | 'diagnostico' | 'proposta' | 'fechado'
}

const initialLeads: Lead[] = [
  { id: '1', nome: 'Indústria Metalúrgica Sul', area: 'Tributário', valorEstimado: 'R$ 180.000,00', contato: 'carlos@metalsul.com.br', fase: 'proposta' },
  { id: '2', nome: 'Mariana Duarte', area: 'Trabalhista', valorEstimado: 'R$ 45.000,00', contato: '(11) 98877-6655', fase: 'diagnostico' },
  { id: '3', nome: 'TechLog Soluções', area: 'Cível', valorEstimado: 'R$ 95.000,00', contato: 'contato@techlog.com', fase: 'fechado' },
  { id: '4', nome: 'Roberto Vasconcelos', area: 'Consumerista', valorEstimado: 'R$ 15.000,00', contato: 'roberto@email.com', fase: 'lead' },
]

export default function Crm() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [showNovo, setShowNovo] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoArea, setNovoArea] = useState('Trabalhista')
  const [novoValor, setNovoValor] = useState('R$ 30.000,00')
  const [novoContato, setNovoContato] = useState('')

  const fases = [
    { id: 'lead', title: '1. Novos Leads', color: 'var(--color-primary)' },
    { id: 'diagnostico', title: '2. Em Diagnóstico', color: 'var(--color-accent)' },
    { id: 'proposta', title: '3. Proposta Enviada', color: '#6b7280' },
    { id: 'fechado', title: '4. Contrato Assinado', color: 'var(--color-success)' },
  ]

  const handleAddLead = (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoNome.trim()) return
    const item: Lead = {
      id: Date.now().toString(),
      nome: novoNome,
      area: novoArea,
      valorEstimado: novoValor,
      contato: novoContato,
      fase: 'lead'
    }
    setLeads([item, ...leads])
    setShowNovo(false)
    setNovoNome('')
    setNovoContato('')
  }

  const handleMoveFase = (id: string, nextFase: 'lead' | 'diagnostico' | 'proposta' | 'fechado') => {
    setLeads(leads.map(l => l.id === id ? { ...l, fase: nextFase } : l))
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)', paddingBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            CRM JURÍDICO & CAPTAÇÃO DE CLIENTES
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: 0, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Pipeline de Oportunidades
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 4 }}>
            Funil de atendimento visual, conversão de contratos e histórico de contatos.
          </p>
        </div>

        <button
          onClick={() => setShowNovo(true)}
          style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Novo Lead / Oportunidade
        </button>
      </div>

      {/* Funil Kanban em 4 Colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'start' }}>
        {fases.map(fase => {
          const items = leads.filter(l => l.fase === fase.id)
          return (
            <div key={fase.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 450 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: fase.color }}>{fase.title}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--color-surface-2)', padding: '2px 6px', borderRadius: 4, color: 'var(--color-muted)' }}>
                  {items.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map(lead => (
                  <div key={lead.id} style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 6, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-foreground)' }}>{lead.nome}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-primary)', background: '#e8eaf0', padding: '2px 6px', borderRadius: 4 }}>{lead.area}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{lead.valorEstimado}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{lead.contato}</div>

                    {/* Botões de Avanço no Funil */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, paddingTop: 8, borderTop: '1px dashed var(--color-border)' }}>
                      {fase.id !== 'lead' && (
                        <button
                          onClick={() => {
                            const prev = fase.id === 'fechado' ? 'proposta' : fase.id === 'proposta' ? 'diagnostico' : 'lead'
                            handleMoveFase(lead.id, prev)
                          }}
                          style={{ flex: 1, padding: '3px', border: '1px solid var(--color-border)', background: 'transparent', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}
                        >
                          ← Voltar
                        </button>
                      )}
                      {fase.id !== 'fechado' && (
                        <button
                          onClick={() => {
                            const next = fase.id === 'lead' ? 'diagnostico' : fase.id === 'diagnostico' ? 'proposta' : 'fechado'
                            handleMoveFase(lead.id, next)
                          }}
                          style={{ flex: 1, padding: '3px', border: 'none', background: 'var(--color-primary)', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Avançar →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal Novo Lead */}
      {showNovo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 28, width: 400 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontFamily: 'var(--font-display)' }}>Nova Oportunidade (CRM)</h3>
            <form onSubmit={handleAddLead} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>NOME DO PROSPECT / CLIENTE</label>
                <input required type="text" placeholder="Ex: Grupo Empresarial Delta" value={novoNome} onChange={e => setNovoNome(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>ÁREA DE ATUAÇÃO</label>
                <select value={novoArea} onChange={e => setNovoArea(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="Trabalhista">Trabalhista</option>
                  <option value="Consumerista">Consumerista</option>
                  <option value="Cível">Cível</option>
                  <option value="Tributário">Tributário</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>VALOR ESTIMADO DO CONTRATO</label>
                <input required type="text" value={novoValor} onChange={e => setNovoValor(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-mono)' }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>CONTATO / TELEFONE / EMAIL</label>
                <input required type="text" placeholder="contato@empresa.com" value={novoContato} onChange={e => setNovoContato(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" onClick={() => setShowNovo(false)} style={{ padding: '8px 14px', border: '1px solid var(--color-border)', background: 'transparent', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '8px 18px', border: 'none', background: 'var(--color-primary)', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Criar Oportunidade</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
