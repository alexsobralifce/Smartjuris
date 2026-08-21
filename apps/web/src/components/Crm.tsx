import { useState } from 'react'
import { maskCurrency } from '../utils/masks'
import Toast, { ToastMessage } from './Toast'
import {
  Button, Field, FONT, inputStyle, Modal, PageContainer, PageHeader, RADIUS, SPACE, useIsMobile,
} from '../ui'

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
  const isMobile = useIsMobile()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [showNovo, setShowNovo] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoArea, setNovoArea] = useState('Trabalhista')
  const [novoValor, setNovoValor] = useState('R$ 30.000,00')
  const [novoContato, setNovoContato] = useState('')

  // Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const fases = [
    { id: 'lead', title: '1. Novos Leads', color: 'var(--color-primary)' },
    { id: 'diagnostico', title: '2. Em Diagnóstico', color: 'var(--color-accent)' },
    { id: 'proposta', title: '3. Proposta Enviada', color: 'var(--color-muted)' },
    { id: 'fechado', title: '4. Contrato Assinado', color: 'var(--color-success)' },
  ]

  // Verificação de Conflito de Interesses (Conflict Check)
  const [conflictAlert, setConflictAlert] = useState<string | null>(null)

  const checkConflict = (name: string) => {
    setNovoNome(name)
    if (!name.trim()) {
      setConflictAlert(null)
      return
    }
    // Lista de adversos em processos ativos para simulação de conflito
    const adversosExistentes = ['Empresa XYZ S.A.', 'Companhia Aérea VooFácil', 'Sindicato dos Trabalhadores', 'Banco do Brasil S.A.']
    const hasConflict = adversosExistentes.some(a => a.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(a.toLowerCase()))
    if (hasConflict) {
      setConflictAlert(`⚠️ CONFLITO DE INTERESSES: O nome "${name}" consta como Parte Adversa (Réu) em processo ativo do escritório. Requer parecer ético antes de prosseguir.`)
    } else {
      setConflictAlert(null)
    }
  }

  const handleAddLead = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!novoNome.trim()) {
      addToast('error', 'O Nome do Prospect / Cliente é obrigatório.')
      return
    }
    if (!novoContato.trim()) {
      addToast('error', 'Informe um meio de contato (telefone ou e-mail).')
      return
    }
    if (conflictAlert) {
      addToast('warning', 'Atenção: Prospect com potencial conflito de interesses cadastrado.')
    }
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
    addToast('success', 'Nova oportunidade criada no funil CRM!')
  }

  const handleMoveFase = (id: string, nextFase: 'lead' | 'diagnostico' | 'proposta' | 'fechado') => {
    setLeads(leads.map(l => l.id === id ? { ...l, fase: nextFase } : l))
  }

  return (
    <PageContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xxl }}>
        <PageHeader
          eyebrow="CRM JURÍDICO & CAPTAÇÃO DE CLIENTES"
          title="Pipeline de Oportunidades"
          description="Funil de atendimento visual, conversão de contratos e histórico de contatos."
          action={<Button onClick={() => setShowNovo(true)}>+ Novo Lead / Oportunidade</Button>}
        />

        {/* Funil Kanban em 4 Colunas — scroll horizontal no mobile */}
        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'start' }}>
            {fases.map(fase => {
              const items = leads.filter(l => l.fase === fase.id)
              return (
                <div key={fase.id} style={{
                  flex: isMobile ? '0 0 260px' : '1 1 0',
                  minWidth: isMobile ? 260 : 0,
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: RADIUS.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 450,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: FONT.base, fontWeight: 700, color: fase.color }}>{fase.title}</span>
                    <span style={{ fontSize: FONT.sm, fontFamily: 'var(--font-mono)', background: 'var(--color-surface-2)', padding: '2px 6px', borderRadius: RADIUS.chip, color: 'var(--color-muted)' }}>
                      {items.length}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map(lead => (
                      <div key={lead.id} style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: FONT.md, fontWeight: 600, color: 'var(--color-foreground)' }}>{lead.nome}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: FONT.xs, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '2px 6px', borderRadius: RADIUS.chip }}>{lead.area}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, fontWeight: 600 }}>{lead.valorEstimado}</span>
                        </div>
                        <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{lead.contato}</div>

                        {/* Botões de Avanço no Funil */}
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, paddingTop: 8, borderTop: '1px dashed var(--color-border)' }}>
                          {fase.id !== 'lead' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              style={{ flex: 1 }}
                              onClick={() => {
                                const prev = fase.id === 'fechado' ? 'proposta' : fase.id === 'proposta' ? 'diagnostico' : 'lead'
                                handleMoveFase(lead.id, prev)
                              }}
                            >
                              ← Voltar
                            </Button>
                          )}
                          {fase.id !== 'fechado' && (
                            <Button
                              size="sm"
                              style={{ flex: 1 }}
                              onClick={() => {
                                const next = fase.id === 'lead' ? 'diagnostico' : fase.id === 'diagnostico' ? 'proposta' : 'fechado'
                                handleMoveFase(lead.id, next)
                              }}
                            >
                              Avançar →
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal Novo Lead */}
        <Modal
          open={showNovo}
          onClose={() => setShowNovo(false)}
          title="Nova Oportunidade (CRM)"
          width={560}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowNovo(false)}>Cancelar</Button>
              <Button onClick={() => handleAddLead()}>Criar Oportunidade</Button>
            </>
          )}
        >
          <form onSubmit={handleAddLead} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nome do prospect / cliente" required>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <span style={{ fontSize: FONT.xs, color: 'var(--color-accent)', fontWeight: 600 }}>🔍 Conflict Check Ativo</span>
              </div>
              <input
                required
                type="text"
                placeholder="Ex: Banco do Brasil S.A. ou Grupo Delta"
                value={novoNome}
                onChange={e => checkConflict(e.target.value)}
                style={inputStyle(!!conflictAlert)}
              />
            </Field>

            {conflictAlert && (
              <div style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: RADIUS.control, padding: '10px 12px', fontSize: FONT.sm, lineHeight: 1.4 }}>
                {conflictAlert}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <Field label="Área de atuação">
                <select value={novoArea} onChange={e => setNovoArea(e.target.value)} style={inputStyle()}>
                  <option value="Trabalhista">Trabalhista</option>
                  <option value="Consumerista">Consumerista</option>
                  <option value="Cível">Cível</option>
                  <option value="Tributário">Tributário</option>
                </select>
              </Field>

              <Field label="Valor estimado do contrato" required>
                <input
                  required
                  type="text"
                  value={novoValor}
                  onChange={e => setNovoValor(maskCurrency(e.target.value))}
                  style={{ ...inputStyle(), fontFamily: 'var(--font-mono)' }}
                />
              </Field>
            </div>

            <Field label="Contato / telefone / e-mail" required>
              <input
                required
                type="text"
                placeholder="contato@empresa.com"
                value={novoContato}
                onChange={e => setNovoContato(e.target.value)}
                style={inputStyle()}
              />
            </Field>
          </form>
        </Modal>

        {/* Componente Toast */}
        <Toast toasts={toasts} onDismiss={dismissToast} />
      </div>
    </PageContainer>
  )
}
