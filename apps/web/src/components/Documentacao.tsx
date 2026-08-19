import { useState } from 'react'

type DocSection = 'wizard' | 'visao-geral' | 'fluxo-trabalho' | 'motor-rag' | 'governanca' | 'faq'

export default function Documentacao() {
  const [activeSection, setActiveSection] = useState<DocSection>('wizard')
  const [searchTerm, setSearchTerm] = useState('')
  const [wizardStep, setWizardStep] = useState(1)

  const wizardSteps = [
    {
      step: 1,
      title: '1. Cadastro de Clientes & Consulta de CEP (ViaCEP)',
      subtitle: 'Evite digitação repetitiva de dados de qualificação',
      icon: '👥',
      badge: 'Passo Inicial',
      desc: 'O primeiro passo no SmartJuris é cadastrar seus clientes (Pessoa Física ou Pessoa Jurídica) no módulo "Clientes".Ao digitar o CEP (ex: 01001-000), o sistema consulta a API oficial ViaCEP e preenche automaticamente a Rua, Bairro, Cidade e UF.',
      tips: [
        'A qualificação gerada automaticamente é reutilizada nas petições para evitar erros de qualificação das partes.',
        'Você pode cadastrar CPF ou CNPJ e associar telefone/e-mail para prontuário completo.'
      ]
    },
    {
      step: 2,
      title: '2. Cadastro de Processos & Matter Dashboard',
      subtitle: 'Gestão visual de prazos e resumos de intimações por IA',
      icon: '📂',
      badge: 'Contencioso',
      desc: 'No módulo "Processos", cadastre os processos ativos do seu escritório. Ao clicar em qualquer processo da tabela, o Matter Dashboard abre a linha do tempo com intimações, despachos e audiências. A IA lê publicações do Diário Eletrônico (DJEN), gera um resumo executivo da ação necessária e calcula o prazo fatal em dias úteis.',
      tips: [
        'Cole a publicação ou intimação inteira no campo do Matter Dashboard para a IA extrair a ordem judicial.',
        'A linha do tempo mantém o histórico cronológico completo para auditoria do processo.'
      ]
    },
    {
      step: 3,
      title: '3. Geração de Peças com RAG & Playbooks de Teses',
      subtitle: 'Elabore petições fundamentadas na legislação oficial sem alucinações',
      icon: '🤖',
      badge: 'Inteligência Artificial',
      desc: 'Acesse o "Gerador de Peças" e selecione o tipo de ação (Inicial, Contestação, Recurso). É possível vincular o processo ativo para que os nomes das partes e a vara sejam preenchidos em 1 clique. Aplique os Playbooks de Teses Pré-Configuradas (Ex: Reclamação Trabalhista com Horas Extras ou Ação Consumerista de Voo Atrasado).',
      tips: [
        'O motor RAG consulta o banco de leis (CPC, CLT, Código Civil, CDC, Súmulas STF/STJ) para citar leis reais.',
        'A minuta é transmitida em tempo real via streaming com o modelo DeepSeek.'
      ]
    },
    {
      step: 4,
      title: '4. Fila de Validação Humana Auditável & Crivo Ético OAB',
      subtitle: 'Garantia de segurança ética e supervisão antes do protocolo',
      icon: '🛡️',
      badge: 'Governança & Ética',
      desc: 'Nenhuma peça gerada por IA vai diretamente para o protocolo sem supervisão. Toda minuta entra na "Fila de Validação". O advogado responsável lê, edita o texto inline se desejar, verifica a contagem de fontes pesquisadas e clica em Aprovar.',
      tips: [
        'O sistema registra a trilha de auditoria: quem gerou, quem aprovou, data/hora e o custo em tokens.',
        'É possível exportar ou copiar a petição finalizada com 1 clique.'
      ]
    },
    {
      step: 5,
      title: '5. Financeiro, Timesheet Faturável & Revisão Contratual',
      subtitle: 'Gestão financeira do escritório e scanner de minutas comerciais',
      icon: '💰',
      badge: 'Gestão Operacional',
      desc: 'Utilize o módulo "Financeiro" para gerenciar honorários fixos e de êxito (ad exitum), além de acionar o Cronômetro de Timesheet faturável (billable hours). No módulo "Revisão Contratual", cole minutas de contratos para o Agente Autônomo classificar riscos (Alto/Atenção) e recomendar redações alternativas.',
      tips: [
        'No CRM & Funil, acompanhe a atração de clientes desde o lead inicial até a assinatura do contrato.',
        'Consulte a aba "Base RAG" para realizar pesquisas semânticas diretas na legislação compilada.'
      ]
    }
  ]

  const sections = [
    { id: 'wizard', label: '🎓 Wizard Passo a Passo', icon: '🪄' },
    { id: 'visao-geral', label: '1. Visão Geral', icon: '🏛️' },
    { id: 'fluxo-trabalho', label: '2. Fluxo Operacional', icon: '⚡' },
    { id: 'motor-rag', label: '3. Motor RAG & Leis', icon: '🧠' },
    { id: 'governanca', label: '4. Ética & LGPD', icon: '🛡️' },
    { id: 'faq', label: '5. Perguntas Frequentes', icon: '❓' },
  ]

  const faqs = [
    {
      q: 'O que garante que a IA não inventará leis ou precedentes falsos?',
      a: 'O SmartJuris opera sob o Motor RAG com legislação oficial indexada (CPC/2015, CLT, Código Civil, CDC, Súmulas STF/STJ). Nenhuma citação é gerada sem âncora na base vetorial real.'
    },
    {
      q: 'Como funciona a busca de endereço por CEP?',
      a: 'Ao cadastrar um cliente no módulo Clientes, digite o CEP no formato 00000-000. O sistema consulta a API oficial ViaCEP e autopreenche rua, bairro, cidade e estado instantaneamente.'
    },
    {
      q: 'O sistema substitui o trabalho do advogado?',
      a: 'Não. O sistema atua como assistente de alta performance. A revisão e aprovação humana é obrigatória por design na Fila de Validação.'
    },
    {
      q: 'Como funciona a qualificação de partes nas peças?',
      a: 'Ao selecionar o cliente cadastrado durante o peticionamento, a qualificação jurídica é preenchida automaticamente no cabeçalho e corpo da petição.'
    }
  ]

  const currentWizard = wizardSteps.find(w => w.step === wizardStep) || wizardSteps[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            MANUAL DO USUÁRIO, WIZARD & ARQUITETURA DE IA
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: 0, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Central de Documentação & Guia
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 6, maxWidth: 680 }}>
            Aprenda passo a passo como operar o SmartJuris e entenda a integração do banco de leis RAG com o seu escritório.
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
                background: activeSection === sec.id ? 'var(--color-primary)' : 'transparent',
                color: activeSection === sec.id ? '#ffffff' : 'var(--color-muted)',
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
          
          {/* Seção 0: Wizard Interativo Didático */}
          {activeSection === 'wizard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    WIZARD APRENDIZADO DIDÁTICO ({wizardStep} de 5)
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '2px 0 0', fontWeight: 400 }}>
                    {currentWizard.title}
                  </h2>
                </div>

                <span style={{ fontSize: 11, fontWeight: 600, background: '#eef0f7', color: 'var(--color-primary)', padding: '4px 10px', borderRadius: 20 }}>
                  {currentWizard.badge}
                </span>
              </div>

              {/* Barra de Progresso do Wizard */}
              <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(wizardStep / 5) * 100}%`, height: '100%', background: 'var(--color-accent)', transition: 'width 0.3s ease' }} />
              </div>

              {/* Card do Passo Atual */}
              <div style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                    {currentWizard.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-foreground)' }}>{currentWizard.subtitle}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4, lineHeight: 1.6 }}>{currentWizard.desc}</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.05em' }}>💡 DICAS DE OPERAÇÃO RÁPIDA:</div>
                  {currentWizard.tips.map((tip, idx) => (
                    <div key={idx} style={{ fontSize: 12, color: 'var(--color-muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--color-accent)' }}>•</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navegação entre Passos do Wizard */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
                <button
                  disabled={wizardStep === 1}
                  onClick={() => setWizardStep(v => Math.max(1, v - 1))}
                  style={{
                    padding: '9px 18px', borderRadius: 6, border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)', fontSize: 13, cursor: wizardStep === 1 ? 'not-allowed' : 'pointer',
                    opacity: wizardStep === 1 ? 0.5 : 1
                  }}
                >
                  ← Passo Anterior
                </button>

                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <button
                      key={s}
                      onClick={() => setWizardStep(s)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', border: 'none',
                        background: wizardStep === s ? 'var(--color-primary)' : 'var(--color-surface-2)',
                        color: wizardStep === s ? '#fff' : 'var(--color-muted)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <button
                  disabled={wizardStep === 5}
                  onClick={() => setWizardStep(v => Math.min(5, v + 1))}
                  style={{
                    padding: '9px 20px', borderRadius: 6, border: 'none',
                    background: wizardStep === 5 ? 'var(--color-border)' : 'var(--color-primary)',
                    color: '#fff', fontSize: 13, fontWeight: 600, cursor: wizardStep === 5 ? 'not-allowed' : 'pointer',
                    opacity: wizardStep === 5 ? 0.5 : 1
                  }}
                >
                  Próximo Passo →
                </button>
              </div>
            </div>
          )}

          {/* Seção 1: Visão Geral */}
          {activeSection === 'visao-geral' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>Visão Geral do SmartJuris LexOS</h2>
              <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                O <strong>SmartJuris LexOS Edition</strong> é um ecossistema SaaS de gestão jurídica inteligente que une contencioso, consultivo, financeiro, CRM e inteligência artificial de alta precisão ancorada na legislação brasileira oficial.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                {[
                  { title: 'Gestão Processual & Matter Dashboard', desc: 'Controle de processos, linha do tempo de andamentos, resumo automático de intimações por IA e calculadora de prazos.' },
                  { title: 'Geração com RAG & IA (DeepSeek)', desc: 'Produção automatizada de petições iniciais, contestações e recursos ancorados na base vetorial pgvector.' },
                  { title: 'Cadastro de Clientes & ViaCEP', desc: 'Consulta automática de endereço por CEP e preenchimento instantâneo da qualificação jurídica.' },
                  { title: 'Financeiro & Timesheet Faturável', desc: 'Gestão de honorários fixos e de êxito (ad exitum), com cronômetro de horas faturáveis (billable hours).' },
                  { title: 'Revisão Contratual & Riscos', desc: 'Scanner autônomo de minutas contratuais para detecção de cláusulas abusivas e sugestão de redações do playbook.' },
                  { title: 'CRM & Funil de Oportunidades', desc: 'Pipeline Kanban de atração e conversão de clientes desde o primeiro contato até a assinatura.' },
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
                    title: 'Cadastrar Cliente & Vincular ao Processo',
                    desc: 'Cadastre o cliente no módulo Clientes (usando o CEP para autopreencher endereço) e vincule ao processo ativo. O sistema puxa automaticamente partes, vara e qualificação jurídica.'
                  },
                  {
                    step: 'Passo 2',
                    title: 'Geração Assistida via RAG & Playbooks',
                    desc: 'No Gerador de Peças, escolha o tipo e aplique um Playbook de Teses (Trabalhista, Cível ou Consumerista). O motor RAG consulta a legislação oficial indexada e transmite a minuta em tempo real.'
                  },
                  {
                    step: 'Passo 3',
                    title: 'Revisão na Fila de Validação',
                    desc: 'A minuta é encaminhada para a Fila de Validação. O advogado faz os ajustes finos inline, confere as fontes legais pesquisadas e aprova para protocolo.'
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

          {/* Seção 3: Motor RAG & Banco de Leis */}
          {activeSection === 'motor-rag' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>Motor RAG & Banco de Leis Indexado</h2>
              <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                O SmartJuris possui um banco vetorial com o corpo legal brasileiro oficial indexado para garantir petições sem alucinações:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { lei: 'Código de Processo Civil (CPC / Lei 13.105/2015)', status: '🟢 Indexado & Atualizado', chunks: '1.420 chunks vetoriais' },
                  { lei: 'Consolidação das Leis do Trabalho (CLT)', status: '🟢 Indexado & Atualizado', chunks: '1.150 chunks vetoriais' },
                  { lei: 'Código Civil (Lei 10.406/2002)', status: '🟢 Indexado & Atualizado', chunks: '1.890 chunks vetoriais' },
                  { lei: 'Código de Defesa do Consumidor (CDC / Lei 8.078/1990)', status: '🟢 Indexado & Atualizado', chunks: '420 chunks vetoriais' },
                  { lei: 'Súmulas Vinculantes STF e Súmulas STJ', status: '🟢 Indexado & Atualizado', chunks: '680 chunks vetoriais' },
                ].map(l => (
                  <div key={l.lei} style={{ padding: 16, borderLeft: '3px solid var(--color-accent)', background: 'var(--color-background)', borderRadius: '0 6px 6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{l.lei}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{l.chunks}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-light)', padding: '3px 8px', borderRadius: 4 }}>
                      {l.status}
                    </span>
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
                  { title: 'Privacidade e Minimização de Dados (LGPD)', text: 'Evite indexar dados pessoais sensíveis desnecessários na base pública de jurisprudência.' },
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
