import { useState } from 'react'
import { Button, FONT, PageContainer, PageHeader, RADIUS, SPACE, useIsMobile } from '../ui'

type DocSection = 'wizard' | 'visao-geral' | 'fluxo-trabalho' | 'motor-rag' | 'governanca' | 'faq'

export default function Documentacao() {
  const isMobile = useIsMobile()
  const [activeSection, setActiveSection] = useState<DocSection>('wizard')
  const [searchTerm, setSearchTerm] = useState('')
  const [wizardStep, setWizardStep] = useState(1)

  const wizardSteps = [
    {
      step: 1,
      title: '1. Captação de Clientes & Checagem de Conflitos',
      subtitle: 'Gestão de Oportunidades e mitigação de conflito de interesses na origem',
      icon: '🎯',
      badge: 'Fase Inicial',
      desc: 'Toda nova oportunidade entra pelo módulo "Funil de Clientes". O sistema utiliza um funil Kanban em 4 fases: Novas Oportunidades, Diagnóstico, Proposta Enviada e Contrato Assinado. Ao cadastrar o Nome do Cliente Potencial, o sistema realiza uma Checagem de Conflitos instantânea.',
      tips: [
        '🔍 Checagem de Conflitos Ativa: O sistema cruza o nome digitado com as partes adversas de todos os processos ativos do escritório para evitar patrocínio infiel.',
        'Os valores de honorários previstos são inseridos no card, garantindo previsibilidade de receita.'
      ]
    },
    {
      step: 2,
      title: '2. Cadastro de Clientes & Consulta de CEP',
      subtitle: 'Evite digitação repetitiva de dados de qualificação',
      icon: '👥',
      badge: 'Passo 2',
      desc: 'Com o cliente convertido, o próximo passo é cadastrá-lo formalmente (Pessoa Física ou Pessoa Jurídica) no módulo "Clientes". O formulário possui validação rigorosa de campos e máscara automática para CPF/CNPJ.',
      tips: [
        'Ao digitar um CEP, a integração com a API ViaCEP preenche automaticamente a Rua, Bairro, Cidade e UF.',
        'A qualificação completa e automática gerada aqui será reaproveitada nos cabeçalhos das petições no Gerador de Peças.'
      ]
    },
    {
      step: 3,
      title: '3. Processos & Painel do Processo',
      subtitle: 'Gestão visual de andamentos e resumos de intimações por IA',
      icon: '📂',
      badge: 'Contencioso',
      desc: 'No módulo "Processos", você centraliza todas as ações ativas. O coração deste módulo é o "Painel do Processo" (Linha do Tempo Interativa), onde toda a vida do processo fica registrada.',
      tips: [
        'Cole publicações do Diário Eletrônico (DJEN) na linha do tempo para a IA extrair a ordem judicial, gerar um resumo em 1 linha e calcular o prazo fatal em dias úteis.',
        'O autocomplete vincula instantaneamente as partes (Clientes cadastrados) ao processo criado.'
      ]
    },
    {
      step: 4,
      title: '4. Geração de Peças & Motor RAG',
      subtitle: 'Petições elaboradas via IA com citação à legislação oficial',
      icon: '🤖',
      badge: 'Inteligência Artificial',
      desc: 'No módulo "Gerador de Peças", selecione o Processo Ativo vinculado. Em vez de escrever do zero, escolha um Modelo de Tese (ex: Indenização Voo Atrasado, Aposentadoria Especial, Assédio Moral). O modelo de IA fundamenta o pedido consultando o banco de dados vetorial de legislação real (RAG).',
      tips: [
        'Toda petição gerada recebe citação das Leis, Decretos e Súmulas indexadas, eliminando o risco da IA "alucinar" leis que não existem.',
        'O conteúdo é gerado em tempo real por streaming, e a petição segue em formato pré-pronto.'
      ]
    },
    {
      step: 5,
      title: '5. Fila de Validação Humana & Crivo Ético',
      subtitle: 'Supervisão técnica obrigatória antes do protocolo final',
      icon: '🛡️',
      badge: 'Governança OAB',
      desc: 'Nenhum documento gerado pela IA vai direto para o cliente ou para o tribunal. Todas as minutas caem na "Fila de Validação". Este módulo é sua central de revisão, garantindo a responsabilidade técnica e o cumprimento ético exigido pela OAB.',
      tips: [
        'O advogado pode realizar edições de texto online, verificar os metadados (custo de tokens gerados) e as fontes normativas consultadas.',
        'Apenas minutas "Aprovadas" ficam aptas para download (exportar para arquivo Word/TXT) e protocolo.'
      ]
    },
    {
      step: 6,
      title: '6. Scanner e Revisão Contratual',
      subtitle: 'Auditoria com rastreabilidade de evidências',
      icon: '📝',
      badge: 'Operações Jurídicas',
      desc: 'No módulo "Contratos", cole o texto integral de uma minuta (ex: NDA ou Prestação de Serviços). A IA faz uma varredura para identificar problemas e calcula o Índice de Risco (0-100).',
      tips: [
        'O Agente Autônomo classifica cada cláusula como: Conforme, Atenção ou Risco Alto, fornecendo a Sugestão de Redação ideal baseada no banco de modelos do escritório.',
        '📍 Rastreabilidade de Evidência: Cada análise indica com precisão a Página, Parágrafo e Linha em que a cláusula problemática se encontra no documento.'
      ]
    },
    {
      step: 7,
      title: '7. Jurimetria & Resumidor Executivo de Acórdãos',
      subtitle: 'Análise de dados com extração da fundamentação de julgados',
      icon: '📊',
      badge: 'Análise Estratégica',
      desc: 'Acesse "Jurimetria" para visualizar indicadores (KPIs) do escritório: Taxa de Êxito (Sucesso), Tempo Médio e a Calculadora Preditiva de Acordos. Você também conta com o Resumidor de Acórdãos IA.',
      tips: [
        '📜 Cole decisões extensas e ementas na aba de Acórdãos. A IA sumariará em segundos o texto, destacando a "Ratio Decidendi" (O fundamento determinante do julgamento) e o resultado (Provido / Improvido).',
        'Os resultados ajudam na precificação do risco em litígios futuros na Calculadora Preditiva.'
      ]
    },
    {
      step: 8,
      title: '8. Gestão Financeira & Registro de Horas',
      subtitle: 'Controle de honorários, fluxo de caixa e horas faturáveis',
      icon: '💰',
      badge: 'Gestão do Escritório',
      desc: 'No módulo "Financeiro", controle os honorários do tipo Fixo, Êxito (Ad Exitum) e Partido Mensal. Registre vencimentos e valores recuperados nas sentenças.',
      tips: [
        '⏱️ Registro de Horas Integrado: Ligue o cronômetro enquanto atua em uma demanda. O sistema salva as horas trabalhadas calculando o valor final pela tarifa do advogado (ex: R$ 350,00/h).',
        'Formulários possuem máscaras financeiras completas e validação contra campos não preenchidos.'
      ]
    }
  ]

  const sections = [
    { id: 'wizard', label: '🎓 Guia Passo a Passo', icon: '🪄' },
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
    },
    {
      q: 'Como funciona a Fila de Revisão/Validação?',
      a: 'A fila de revisão atua como um crivo ético obrigatório. Nenhuma peça gerada pela IA é finalizada automaticamente. O documento fica pendente na fila, onde o advogado pode verificar a Trilha de Auditoria (com os modelos e leis RAG utilizadas), editar o texto e, finalmente, clicar em "Aprovar para Protocolo" ou "Reprovar". Apenas peças aprovadas podem ser exportadas.'
    }
  ]

  const currentWizard = wizardSteps.find(w => w.step === wizardStep) || wizardSteps[0]

  return (
    <PageContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xxl }}>
        <PageHeader
          eyebrow="MANUAL DO USUÁRIO, GUIA & ARQUITETURA DE IA"
          title="Central de Documentação & Guia"
          description="Aprenda passo a passo como operar o SmartJuris e entenda a integração do banco de leis RAG com o seu escritório."
          action={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.control, padding: '8px 14px' }}>
              <span style={{ fontSize: FONT.md }}>🔍</span>
              <input
                type="text"
                placeholder="Buscar tópicos ou dúvidas..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: FONT.md, fontFamily: 'var(--font-sans)', width: 220 }}
              />
            </div>
          )}
        />

        {/* Grid Principal: Navegação Lateral + Conteúdo */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr', gap: 32, alignItems: 'start' }}>
          {/* Menu Lateral de Seções */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: 8 }}>
            {sections.map(sec => (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id as DocSection)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: RADIUS.control,
                  border: 'none',
                  background: activeSection === sec.id ? 'var(--color-primary)' : 'transparent',
                  color: activeSection === sec.id ? 'var(--color-on-primary)' : 'var(--color-muted)',
                  fontWeight: activeSection === sec.id ? 600 : 500,
                  fontSize: FONT.md,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <span>{sec.icon}</span>
                <span>{sec.label}</span>
              </button>
            ))}

            {/* Suporte Técnico Box */}
            <div style={{
              marginTop: 24,
              padding: 16,
              background: 'var(--color-background)',
              borderRadius: RADIUS.card,
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div style={{ fontSize: FONT.sm, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💬</span> Suporte Técnico
              </div>
              <p style={{ fontSize: FONT.base, color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
                Dúvidas ou problemas com o sistema? Fale com nosso suporte técnico no WhatsApp.
              </p>
              <a
                href="https://wa.me/5588993573809"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: 'var(--color-primary)',
                  color: 'var(--color-on-primary)',
                  textDecoration: 'none',
                  padding: '8px 12px',
                  borderRadius: RADIUS.chip,
                  fontSize: FONT.base,
                  fontWeight: 600,
                  transition: 'background 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-primary-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--color-primary)'}
              >
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.733-1.455L0 24zm6.59-4.846c1.66.986 3.292 1.503 5.343 1.504 5.518 0 10.005-4.486 10.008-10.004.002-2.673-1.04-5.184-2.937-7.082C17.16 1.671 14.654.626 12.012.626 6.495.626 2.006 5.111 2.003 10.63c-.001 2.083.548 4.115 1.591 5.922L2.557 20.3l3.96-1.036c.057.031.114.062.17.09z"/>
                </svg>
                <span>WhatsApp Suporte</span>
              </a>
            </div>
          </div>

          {/* Painel de Conteúdo */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: 32 }}>

            {/* Seção 0: Wizard Interativo Didático */}
            {activeSection === 'wizard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: FONT.sm, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      WIZARD APRENDIZADO DIDÁTICO ({wizardStep} de 8)
                    </span>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, margin: '2px 0 0', fontWeight: 400 }}>
                      {currentWizard.title}
                    </h2>
                  </div>

                  <span style={{ fontSize: FONT.sm, fontWeight: 600, background: 'var(--color-badge-tint)', color: 'var(--color-primary)', padding: '4px 10px', borderRadius: 20 }}>
                    {currentWizard.badge}
                  </span>
                </div>

                {/* Barra de Progresso do Wizard */}
                <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: RADIUS.chip, overflow: 'hidden' }}>
                  <div style={{ width: `${(wizardStep / 8) * 100}%`, height: '100%', background: 'var(--color-accent)', transition: 'width 0.3s ease' }} />
                </div>

                {/* Card do Passo Atual */}
                <div style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ width: 48, height: 48, borderRadius: RADIUS.card, background: 'var(--color-primary)', color: 'var(--color-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: FONT.cardTitle, flexShrink: 0 }}>
                      {currentWizard.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: FONT.xl, fontWeight: 600, color: 'var(--color-foreground)' }}>{currentWizard.subtitle}</div>
                      <div style={{ fontSize: FONT.md, color: 'var(--color-muted)', marginTop: 4, lineHeight: 1.6 }}>{currentWizard.desc}</div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: FONT.sm, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.05em' }}>💡 DICAS DE OPERAÇÃO RÁPIDA:</div>
                    {currentWizard.tips.map((tip, idx) => (
                      <div key={idx} style={{ fontSize: FONT.base, color: 'var(--color-muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ color: 'var(--color-accent)' }}>•</span>
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Navegação entre Passos do Wizard */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={wizardStep === 1}
                    onClick={() => setWizardStep(v => Math.max(1, v - 1))}
                  >
                    ← Passo Anterior
                  </Button>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                      <button
                        key={s}
                        onClick={() => setWizardStep(s)}
                        aria-label={`Ir para o passo ${s}`}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', border: 'none',
                          background: wizardStep === s ? 'var(--color-primary)' : 'var(--color-surface-2)',
                          color: wizardStep === s ? 'var(--color-on-primary)' : 'var(--color-muted)',
                          fontSize: FONT.base, fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <Button
                    size="sm"
                    disabled={wizardStep === 8}
                    onClick={() => setWizardStep(v => Math.min(8, v + 1))}
                  >
                    Próximo Passo →
                  </Button>
                </div>
              </div>
            )}

            {/* Seção 1: Visão Geral */}
            {activeSection === 'visao-geral' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, margin: 0 }}>Visão Geral do SmartJuris LexOS</h2>
                <p style={{ color: 'var(--color-muted)', fontSize: FONT.lg, lineHeight: 1.6, margin: 0 }}>
                  O <strong>SmartJuris LexOS Edition</strong> é um ecossistema SaaS de gestão jurídica inteligente que une contencioso, consultivo, financeiro, CRM e inteligência artificial de alta precisão ancorada na legislação brasileira oficial.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginTop: 12 }}>
                  {[
                    { title: 'Gestão Processual & Painel do Processo', desc: 'Controle de processos, linha do tempo de andamentos, resumo automático de intimações por IA e calculadora de prazos.' },
                    { title: 'Geração com RAG & IA (Qwen)', desc: 'Produção automatizada de petições iniciais, contestações e recursos ancorados na base vetorial pgvector.' },
                    { title: 'Cadastro de Clientes & ViaCEP', desc: 'Consulta automática de endereço por CEP e preenchimento instantâneo da qualificação jurídica.' },
                    { title: 'Financeiro & Horas Cobráveis', desc: 'Gestão de honorários fixos e de êxito (ad exitum), com cronômetro de horas faturáveis (horas cobráveis).' },
                    { title: 'Revisão Contratual & Riscos', desc: 'Scanner autônomo de minutas contratuais para detecção de cláusulas abusivas e sugestão de redações padronizadas.' },
                    { title: 'Funil de Clientes & Oportunidades', desc: 'Pipeline Kanban de atração e conversão de clientes desde o primeiro contato até a assinatura.' },
                  ].map(item => (
                    <div key={item.title} style={{ padding: 16, border: '1px solid var(--color-border)', borderRadius: RADIUS.card, background: 'var(--color-background)' }}>
                      <div style={{ fontSize: FONT.md, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 4 }}>{item.title}</div>
                      <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seção 2: Fluxo Operacional */}
            {activeSection === 'fluxo-trabalho' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, margin: 0 }}>Fluxo Operacional em 3 Passos</h2>
                <p style={{ color: 'var(--color-muted)', fontSize: FONT.lg, margin: 0 }}>
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
                      title: 'Geração Assistida via RAG & Modelos',
                      desc: 'No Gerador de Peças, escolha o tipo e aplique um Modelo de Teses (Trabalhista, Cível ou Consumerista). O motor RAG consulta a legislação oficial indexada e transmite a minuta em tempo real.'
                    },
                    {
                      step: 'Passo 3',
                      title: 'Revisão na Fila de Validação',
                      desc: 'A minuta é encaminhada para a Fila de Validação. O advogado faz os ajustes finos inline, confere as fontes legais pesquisadas e aprova para protocolo.'
                    }
                  ].map(st => (
                    <div key={st.step} style={{ display: 'flex', gap: 16, padding: 18, border: '1px solid var(--color-border)', borderRadius: RADIUS.card, background: 'var(--color-background)' }}>
                      <div style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', fontSize: FONT.sm, fontWeight: 700, padding: '4px 10px', borderRadius: RADIUS.chip, height: 'fit-content' }}>
                        {st.step}
                      </div>
                      <div>
                        <div style={{ fontSize: FONT.lg, fontWeight: 600, marginBottom: 4 }}>{st.title}</div>
                        <div style={{ fontSize: FONT.md, color: 'var(--color-muted)', lineHeight: 1.5 }}>{st.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seção 3: Motor RAG & Banco de Leis */}
            {activeSection === 'motor-rag' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, margin: 0 }}>Motor RAG & Banco de Leis Indexado</h2>
                <p style={{ color: 'var(--color-muted)', fontSize: FONT.lg, lineHeight: 1.5, margin: 0 }}>
                  O SmartJuris possui um banco vetorial com o corpo legal brasileiro oficial indexado para garantir petições sem alucinações:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { lei: 'Lei de Benefícios da Previdência Social (LBPS / Lei 8.213/1991)', status: '🟢 Indexado & Atualizado', chunks: '920 chunks vetoriais' },
                    { lei: 'Regulamento da Previdência Social (RPS / Decreto 3.048/1999)', status: '🟢 Indexado & Atualizado', chunks: '1.480 chunks vetoriais' },
                    { lei: 'Instrução Normativa PRES/INSS nº 128/2022 (Processo Administrativo)', status: '🟢 Indexado & Atualizado', chunks: '2.100 chunks vetoriais' },
                    { lei: 'Súmulas da TNU e Conselho de Recursos da Previdência (CRPS)', status: '🟢 Indexado & Atualizado', chunks: '530 chunks vetoriais' },
                    { lei: 'Código de Processo Civil (CPC / Lei 13.105/2015)', status: '🟢 Indexado & Atualizado', chunks: '1.420 chunks vetoriais' },
                    { lei: 'Consolidação das Leis do Trabalho (CLT)', status: '🟢 Indexado & Atualizado', chunks: '1.150 chunks vetoriais' },
                    { lei: 'Código Civil (Lei 10.406/2002)', status: '🟢 Indexado & Atualizado', chunks: '1.890 chunks vetoriais' },
                    { lei: 'Código de Defesa do Consumidor (CDC / Lei 8.078/1990)', status: '🟢 Indexado & Atualizado', chunks: '420 chunks vetoriais' },
                    { lei: 'Súmulas Vinculantes STF e Súmulas STJ', status: '🟢 Indexado & Atualizado', chunks: '680 chunks vetoriais' },
                  ].map(l => (
                    <div key={l.lei} style={{ padding: 16, borderLeft: '3px solid var(--color-accent)', background: 'var(--color-background)', borderRadius: `0 ${RADIUS.card}px ${RADIUS.card}px 0`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: FONT.md, fontWeight: 600 }}>{l.lei}</div>
                        <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginTop: 2 }}>{l.chunks}</div>
                      </div>
                      <span style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-light)', padding: '3px 8px', borderRadius: RADIUS.chip }}>
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
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, margin: 0 }}>Governança, Ética e LGPD</h2>
                <p style={{ color: 'var(--color-muted)', fontSize: FONT.lg, lineHeight: 1.6, margin: 0 }}>
                  Diretrizes de responsabilidade profissional para o uso de IA no ambiente jurídico:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { title: 'Supervisão Humana Obrigatória', text: 'Toda peça gerada por IA deve ser considerada uma minuta preliminar. O advogado é civil e eticamente responsável pelo conteúdo protocolado perante o Poder Judiciário.' },
                    { title: 'Privacidade e Minimização de Dados (LGPD)', text: 'Evite indexar dados pessoais sensíveis desnecessários na base pública de jurisprudência.' },
                    { title: 'Rastreabilidade e Auditoria', text: 'O SmartJuris mantém registro do modelo utilizado, quantidade de fontes consultadas e data/hora da validação para fins de auditoria interna do escritório.' },
                  ].map(gov => (
                    <div key={gov.title} style={{ padding: 16, border: '1px solid var(--color-border)', borderRadius: RADIUS.card, background: 'var(--color-background)' }}>
                      <div style={{ fontSize: FONT.md, fontWeight: 600, color: 'var(--color-danger)', marginBottom: 4 }}>{gov.title}</div>
                      <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', lineHeight: 1.5 }}>{gov.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seção 5: FAQ */}
            {activeSection === 'faq' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, margin: 0 }}>Perguntas Frequentes (FAQ)</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {faqs
                    .filter(f => !searchTerm || f.q.toLowerCase().includes(searchTerm.toLowerCase()) || f.a.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((f, i) => (
                      <div key={i} style={{ padding: 18, border: '1px solid var(--color-border)', borderRadius: RADIUS.card, background: 'var(--color-background)' }}>
                        <div style={{ fontSize: FONT.md, fontWeight: 600, marginBottom: 6, color: 'var(--color-foreground)' }}>
                          {f.q}
                        </div>
                        <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', lineHeight: 1.6 }}>
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
    </PageContainer>
  )
}
