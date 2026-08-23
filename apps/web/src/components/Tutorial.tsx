import { useState, type CSSProperties } from 'react'
import { Button, PageContainer, PageHeader, FONT, SPACE, RADIUS, useIsMobile } from '../ui'

interface Passo {
  titulo: string
  texto: string
}

interface ModuloTutorial {
  id: string
  label: string
  descricao: string
  imagem: string
  passos: Passo[]
}

const modulos: ModuloTutorial[] = [
  {
    id: 'landing', label: 'Entrar no Sistema', descricao: 'Acessar o SmartJuris e fazer login com as credenciais de demonstração.',
    imagem: '/tutorial/images/01-login.png',
    passos: [
      { titulo: 'Tela de Login', texto: 'Abra o SmartJuris no navegador. Informe o e-mail institucional (ex.: admin@smartjuris.com) e a senha de acesso, e clique em "Entrar no Sistema →".' },
      { titulo: 'Credenciais de demonstração', texto: 'Para testar, use o perfil Administrador (admin@smartjuris.com / admin123) ou Usuário (user@smartjuris.com / user123). Todos os dados são fakes de demonstração.' },
    ],
  },
  {
    id: 'dashboard', label: 'Painel (Dashboard)', descricao: 'Visão geral do escritório: KPIs, peças recentes e prazos críticos.',
    imagem: '/tutorial/images/02-dashboard.png',
    passos: [
      { titulo: 'Indicadores', texto: 'O Painel reúne os números do escritório: processos ativos, peças geradas, itens aguardando revisão e a taxa de aprovação.' },
      { titulo: 'Peças Recentes e Prazos', texto: 'Acompanhe as peças recém-geradas e, no painel lateral, os prazos críticos (implantações/audiências) e o status do Motor RAG (modelos ativos e embeddings).' },
    ],
  },
  {
    id: 'agenda', label: 'Agenda', descricao: 'Audiências, reuniões e prazos do escritório.',
    imagem: '/tutorial/images/03-agenda.png',
    passos: [
      { titulo: 'Calendário', texto: 'A Agenda mostra os eventos do mês (audiências, reuniões, prazos e diligências). Navegue pelos meses e clique em uma data para adicionar um evento.' },
      { titulo: 'Criar evento', texto: 'Preencha título, tipo, data/hora e vínculo com processo ou cliente. Eventos críticos ajudam no controle de prazos fatídicos.' },
    ],
  },
  {
    id: 'processos', label: 'Processos', descricao: 'Gestão de processos com linha do tempo e resumos por IA.',
    imagem: '/tutorial/images/04-processos.png',
    passos: [
      { titulo: 'Lista de processos', texto: 'Acesse os processos do escritório. Use a busca e os filtros para localizar por número, cliente, área ou status.' },
      { titulo: 'Linha do tempo e intimações', texto: 'No detalhe do processo, acompanhe a linha do tempo e os resumos de intimações gerados por IA, com ação recomendada e prazo fatal.' },
    ],
  },
  {
    id: 'clientes', label: 'Clientes', descricao: 'Cadastro de clientes PF/PJ com máscaras e busca de CEP.',
    imagem: '/tutorial/images/05-clientes.png',
    passos: [
      { titulo: 'Cadastro de cliente', texto: 'Cadastre clientes Pessoa Física ou Jurídica. Os campos de CPF/CNPJ e telefone têm máscara automática; o CEP é preenchido pela busca automática (ViaCEP).' },
      { titulo: 'Qualificação e dados', texto: 'Preencha a qualificação (para peças), dados de contato e endereço. Clientes vinculados aparecem nos processos e peças.' },
    ],
  },
  {
    id: 'pecas', label: 'Gerar Peças', descricao: 'Gerador de peças com IA (RAG + jurisprudência ao vivo).',
    imagem: '/tutorial/images/06-gerar-pecas.png',
    passos: [
      { titulo: 'Fluxo em 4 etapas', texto: 'O gerador progressivo: 1) Selecionar Tipo → 2) Dados do Caso → 3) Geração IA → 4) Revisão. Escolha a área do direito e o tipo de peça.' },
      { titulo: 'Vincular processo e tese', texto: 'Vincule um processo cadastrado (autopreenche partes/juízo) e, se quiser, escolha um modelo de tese. A geração usa o RAG local + jurisprudência ao vivo quando ativado.' },
    ],
  },
  {
    id: 'validacao', label: 'Validação', descricao: 'Fila de revisão humana das peças geradas.',
    imagem: '/tutorial/images/07-validacao.png',
    passos: [
      { titulo: 'Fila de revisão', texto: 'As peças geradas pela IA entram na fila de validação. Abra uma peça para revisar o conteúdo antes de aprovar ou reprovar (crivo ético OAB).' },
      { titulo: 'Exportar e aprovar', texto: 'Edite se necessário, aprove a peça e exporte em PDF ou DOCX com o timbre do escritório.' },
    ],
  },
  {
    id: 'jurimetria', label: 'Jurimetria', descricao: 'Analytics de êxito por área e calculadora de risco.',
    imagem: '/tutorial/images/08-jurimetria.png',
    passos: [
      { titulo: 'Taxa de êxito', texto: 'Veja a taxa de êxito por área e status, com base nos processos do escritório.' },
      { titulo: 'Calculadora preditiva', texto: 'Use a calculadora de risco para estimar a chance de êxito de uma tese — apoio à decisão de aceitar um caso.' },
    ],
  },
  {
    id: 'decisoes', label: 'Decisões & Tribunais', descricao: 'Consulta ao vivo de jurisprudência (Jurisprudências.ai).',
    imagem: '/tutorial/images/09-decisoes.png',
    passos: [
      { titulo: 'Busca por termo/tese', texto: 'Consulte jurisprudência ao vivo: escolha o tribunal, digite o termo ou tese e filtre por data. As sugestões rápidas ajudam na busca.' },
      { titulo: 'Usar na peça', texto: 'Copie a citação com a ementa formatada ou envie a decisão direto para o Gerador de Peças. O portal do provedor (Jurisprudências.ai) está disponível no topo.' },
    ],
  },
  {
    id: 'financeiro', label: 'Financeiro', descricao: 'Honorários, despesas e timesheet faturável.',
    imagem: '/tutorial/images/10-financeiro.png',
    passos: [
      { titulo: 'Lançamentos', texto: 'Registre honorários fixos, êxito e despesas por processo/cliente, com vencimento e status.' },
      { titulo: 'Timesheet', texto: 'Use o cronômetro para registrar horas faturáveis por processo, com valor-hora — controle billable time.' },
    ],
  },
  {
    id: 'contratos', label: 'Revisão Contratual', descricao: 'Scanner autônomo de minutas com detecção de riscos.',
    imagem: '/tutorial/images/11-contratos.png',
    passos: [
      { titulo: 'Enviar minuta', texto: 'Envie a minuta do contrato para o scanner; a IA detecta cláusulas de risco e sugestões de redação.' },
      { titulo: 'Revisar sugestões', texto: 'Revise os pontos destacados e as sugestões; aceite ou edite a redação proposta.' },
    ],
  },
  {
    id: 'crm', label: 'CRM & Funil', descricao: 'Funil de clientes: Lead → Diagnóstico → Proposta → Contrato.',
    imagem: '/tutorial/images/12-crm.png',
    passos: [
      { titulo: 'Kanban', texto: 'O funil em 4 fases (Lead, Diagnóstico, Proposta, Contrato). Arraste os leads conforme avançam no atendimento.' },
      { titulo: 'Alerta de conflito', texto: 'O CRM sinaliza conflito de interesses ao cadastrar um novo potencial cliente (verificação de partes adversas).' },
    ],
  },
  {
    id: 'base', label: 'Base RAG', descricao: 'Base de conhecimento vetorial para fundamentar as peças.',
    imagem: '/tutorial/images/13-base.png',
    passos: [
      { titulo: 'Documentos e coleções', texto: 'Gerencie as coleções indexadas: envie documentos do escritório (contratos, pareceres, teses) para a base vetorial.' },
      { titulo: 'Busca semântica', texto: 'A busca semântica (BGE-M3) recupera os trechos relevantes da base, usados no RAG da geração de peças.' },
    ],
  },
  {
    id: 'documentacao', label: 'Documentação', descricao: 'Central de ajuda, manual e arquitetura.',
    imagem: '/tutorial/images/14-documentacao.png',
    passos: [
      { titulo: 'Manual e ajuda', texto: 'Encontre o manual em 3 passos, a arquitetura em camadas, LGPD e perguntas frequentes.' },
      { titulo: 'Visão geral', texto: 'Explore a documentação para entender os módulos e fluxos do SmartJuris.' },
    ],
  },
  {
    id: 'admin', label: 'Administração', descricao: 'Configuração do escritório, usuários e permissões.',
    imagem: '/tutorial/images/15-admin.png',
    passos: [
      { titulo: 'Identidade e métricas', texto: 'Configure o timbre (cidade/OAB), veja as métricas do escritório e gerencie a conta.' },
      { titulo: 'Usuários e permissões', texto: 'Adicione usuários do escritório e defina as permissões por módulo (quais telas cada advogado acessa).' },
    ],
  },
]

const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: SPACE.md,
}

const CARD: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: RADIUS.lg,
  padding: SPACE.lg,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.xs,
  transition: 'border-color .15s',
}

const IMG: CSSProperties = {
  width: '100%',
  borderRadius: RADIUS.md,
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-surface-2)',
}

export default function Tutorial() {
  const isMobile = useIsMobile()
  const [moduloIdx, setModuloIdx] = useState<number | null>(null)
  const [passoIdx, setPassoIdx] = useState(0)

  const modulo = moduloIdx !== null ? modulos[moduloIdx] : null

  const abrir = (i: number) => {
    setModuloIdx(i)
    setPassoIdx(0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const voltarParaLista = () => setModuloIdx(null)

  return (
    <PageContainer>
      <PageHeader
        eyebrow="GUIA"
        title="Tutorial"
        description="Wizards com imagens das telas ensinando a usar cada módulo do SmartJuris. Use as credenciais de demonstração para acompanhar."
      />

      {modulo === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          <div style={GRID}>
            {modulos.map((m, i) => (
              <div key={m.id} style={CARD} onClick={() => abrir(i)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') abrir(i) }}>
                <img src={m.imagem} alt={m.label} style={{ ...IMG, aspectRatio: '16/9', objectFit: 'cover', height: 120 }} />
                <strong style={{ fontSize: FONT.md, color: 'var(--color-foreground)' }}>{m.label}</strong>
                <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.4 }}>{m.descricao}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>
            💡 Clique em um módulo para abrir o passo a passo. Todo o conteúdo usa dados de demonstração (fakes) — nenhum dado real.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          {/* Controles do wizard */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.sm }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
              <Button size="sm" variant="secondary" onClick={voltarParaLista}>← Todos os módulos</Button>
              <strong style={{ fontSize: FONT.md, color: 'var(--color-foreground)' }}>{modulo.label}</strong>
              <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>Passo {passoIdx + 1} de {modulo.passos.length}</span>
            </div>
            <div style={{ display: 'flex', gap: SPACE.sm }}>
              <Button size="sm" variant="secondary" disabled={passoIdx === 0} onClick={() => setPassoIdx((p) => Math.max(0, p - 1))}>← Anterior</Button>
              <Button size="sm" onClick={() => setPassoIdx((p) => Math.min(modulo.passos.length - 1, p + 1))}>Próximo →</Button>
            </div>
          </div>

          {/* Slider de passos */}
          <div style={{ position: 'relative' }}>
            {modulo.passos.map((p, i) => (
              <div key={i} style={{ display: i === passoIdx ? 'block' : 'none' }}>
                <img src={modulo.imagem} alt={p.titulo} style={{ ...IMG, maxHeight: isMobile ? 'none' : 460, objectFit: 'contain', background: '#fff' }} />
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.lg, padding: SPACE.lg, marginTop: SPACE.sm }}>
                  <strong style={{ display: 'block', fontSize: FONT.md, color: 'var(--color-foreground)', marginBottom: 4 }}>{p.titulo}</strong>
                  <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.5 }}>{p.texto}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Navegação entre módulos */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.sm, borderTop: '1px solid var(--color-border)', paddingTop: SPACE.md }}>
            <Button size="sm" variant="secondary" disabled={moduloIdx === 0} onClick={() => abrir(moduloIdx! - 1)}>← Módulo anterior</Button>
            <span style={{ fontSize: FONT.xs, color: 'var(--color-muted)' }}>Módulo {moduloIdx! + 1} de {modulos.length}</span>
            <Button size="sm" disabled={moduloIdx === modulos.length - 1} onClick={() => abrir(moduloIdx! + 1)}>Próximo módulo →</Button>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
