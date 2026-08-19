import { useState } from 'react'

type DocSection = 'visao-geral' | 'fluxo-trabalho' | 'motor-rag' | 'governanca' | 'faq'

export default function Documentacao() {
  const [activeSection, setActiveSection] = useState<DocSection>('visao-geral')
  const [searchTerm, setSearchTerm] = useState('')

  const sections = [
    { id: 'visao-geral', label: '1. Visão Geral', icon: '🏛️' },
    { id: 'fluxo-trabalho', label: '2. Fluxo Operacional', icon: '⚡' },
    { id: 'motor-rag', label: '3. Motor RAG & IA', icon: '🧠' },
    { id: 'governanca', label: '4. Ética & LGPD', icon: '🛡️' },
    { id: 'faq', label: '5. Perguntas Frequentes', icon: '❓' },
  ]

  const faqs = [
    {
      q: 'O que garante que a IA não inventará leis ou precedentes falsos?',
      a: 'O SmartJuris opera sob a Camada 4 de Validação e Rastreabilidade. Toda peça é ancorada estritamente na base vetorial (RAG) de leis, súmulas e julgados reais do seu escritório e tribunais oficiais. Nenhuma citação é gerada no vazio.'
    },
    {
      q: 'O sistema substitui o trabalho do advogado?',
      a: 'Não. O sistema atua como um assistente de alta velocidade (padrão draft-first-then-edit). A revisão e aprovação humana é obrigatória por design antes de qualquer peticionamento.'
    },
    {
      q: 'Como os dados dos clientes são protegidos?',
      a: 'O SmartJuris adota isolamento de dados por escritório em banco Postgres com criptografia. Dados confidenciais não são compartilhados para treinamento público.'
    },
    {
      q: 'Como funciona a vinculação de processo à geração de peças?',
      a: 'No Gerador de Peças, basta selecionar o processo ativo. O sistema puxa automaticamente as partes (autor e réu), o juízo/vara e o valor da causa, economizando tempo de digitação repetitiva.'
    }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            MANUAL DO USUÁRIO & ARQUITETURA
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: 0, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Central de Documentação
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 6, maxWidth: 650 }}>
            Guia completo de operação, boas práticas e arquitetura de IA jurídica do SmartJuris.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '8px 14px' }}>
          <span style={{ fontSize: 13 }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar tópicos ou dúvidas..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'var(--font-sans)', width: 220 }}
          />
        </div>
      </div>

      {/* Grid Principal: Navegação Lateral + Conteúdo */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 32, alignItems: 'start' }}>
        {/* Menu Lateral de Seções */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8 }}>
          {sections.map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id as DocSection)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 6,
                border: 'none',
                background: activeSection === sec.id ? 'var(--color-surface-2)' : 'transparent',
                color: activeSection === sec.id ? 'var(--color-primary)' : 'var(--color-muted)',
                fontWeight: activeSection === sec.id ? 600 : 500,
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span>{sec.icon}</span>
              <span>{sec.label}</span>
            </button>
          ))}
        </div>

        {/* Painel de Conteúdo */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 32 }}>
          
          {/* Seção 1: Visão Geral */}
          {activeSection === 'visao-geral' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>Visão Geral do SmartJuris</h2>
              <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                O <strong>SmartJuris</strong> é um sistema jurídico de alta precisão desenhado para escritórios de advocacia que buscam acelerar a produção de peças e a gestão processual através de inteligência artificial ancorada em dados próprios.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                {[
                  { title: 'Gestão Processual (CRM)', desc: 'Controle de processos judiciais, clientes, partes adversas, prazos fatais e atribuição de advogados.' },
                  { title: 'Geração com RAG & IA', desc: 'Produção automatizada de petições iniciais, contestações e recursos com base na jurisprudência do escritório.' },
                  { title: 'Fila de Validação Humana', desc: 'Supervisão ética obrigatória: nenhuma peça é finalizada sem a revisão e chancela do advogado.' },
                  { title: 'Jurimetria Preditiva', desc: 'Análise de dados estatísticos de varas e comarcas para prever probabilidades de êxito e tempo de julgamento.' },
                ].map(item => (
                  <div key={item.title} style={{ padding: 16, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-background)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seção 2: Fluxo Operacional */}
          {activeSection === 'fluxo-trabalho' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>Fluxo Operacional em 3 Passos</h2>
              <p style={{ color: 'var(--color-muted)', fontSize: 14, margin: 0 }}>
                Como transformar um novo caso em uma petição pronta para protocolo em menos de 2 minutos:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  {
                    step: 'Passo 1',
                    title: 'Vincular Processo ou Selecionar Tese',
                    desc: 'Acesse "Gerar Peças", selecione a Área do Direito (Trabalhista, Cível, Consumerista) e escolha o tipo de peça. Opcionalmente, vincule a um processo ativo para auto-preencher autor, réu e vara.'
                  },
                  {
                    step: 'Passo 2',
                    title: 'Geração Assistida via RAG',
                    desc: 'O motor do SmartJuris consulta a base vetorial de leis e julgados, monta a argumentação jurídica estruturada e transmite a minuta em tempo real na tela.'
                  },
                  {
                    step: 'Passo 3',
                    title: 'Revisão na Fila de Validação',
                    desc: 'A peça gerada é automaticamente encaminhada para a Fila de Validação. O advogado revisa, ajusta o texto inline, confere os fundamentos e clica em Aprovar para copiar ou protocolar.'
                  }
                ].map(st => (
                  <div key={st.step} style={{ display: 'flex', gap: 16, padding: 18, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-background)' }}>
                    <div style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 4, height: 'fit-content' }}>
                      {st.step}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{st.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5 }}>{st.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seção 3: Motor RAG & IA */}
          {activeSection === 'motor-rag' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>As 4 Camadas da Arquitetura</h2>
              <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                O SmartJuris não utiliza LLM cru (sem contexto). O sistema opera sobre uma arquitetura de 4 camadas:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { layer: 'Camada 1: Geração (LLM)', tag: 'DeepSeek / OpenAI', desc: 'Responsável pela redação culta, coesão textual e estrutura formal da petição.' },
                  { layer: 'Camada 2: Recuperação (RAG)', tag: 'pgvector + BGE-M3', desc: 'Busca semântica em tempo real na base de precedentes, súmulas e julgados do escritório.' },
                  { layer: 'Camada 3: Playbooks & Teses', tag: 'Templates Jurídicos', desc: 'Estruturação prévia de pedidos obrigatórios, qualificações e teses consolidadas.' },
                  { layer: 'Camada 4: Validação Anti-Alucinação', tag: 'Integridade Legal', desc: 'Verificação obrigatória de citações e crivo humano antes de qualquer protocolo.' },
                ].map(l => (
                  <div key={l.layer} style={{ padding: 16, borderLeft: '3px solid var(--color-accent)', background: 'var(--color-background)', borderRadius: '0 6px 6px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{l.layer}</span>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--color-surface-2)', padding: '2px 8px', borderRadius: 4 }}>{l.tag}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{l.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seção 4: Ética & LGPD */}
          {activeSection === 'governanca' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>Governança, Ética e LGPD</h2>
              <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                Diretrizes de responsabilidade profissional para o uso de IA no ambiente jurídico:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { title: 'Supervisão Humana Obrigatória', text: 'Toda peça gerada por IA deve ser considerada uma minuta preliminar. O advogado é civil e eticamente responsável pelo conteúdo protocolado perante o Poder Judiciário.' },
                  { title: 'Privacidade e Minimização de Dados (LGPD)', text: 'Evite indexar dados pessoais sensíveis desnecessários (como senhas ou exames médicos sigilosos) na base pública de jurisprudência.' },
                  { title: 'Rastreabilidade e Auditoria', text: 'O SmartJuris mantém registro do modelo utilizado, quantidade de fontes consultadas e data/hora da validação para fins de auditoria interna do escritório.' },
                ].map(gov => (
                  <div key={gov.title} style={{ padding: 16, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-background)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-danger)', marginBottom: 4 }}>{gov.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5 }}>{gov.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seção 5: FAQ */}
          {activeSection === 'faq' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>Perguntas Frequentes (FAQ)</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {faqs
                  .filter(f => !searchTerm || f.q.toLowerCase().includes(searchTerm.toLowerCase()) || f.a.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((f, i) => (
                    <div key={i} style={{ padding: 18, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-background)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--color-foreground)' }}>
                        {f.q}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.6 }}>
                        {f.a}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
