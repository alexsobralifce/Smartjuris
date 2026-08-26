import { useState, useEffect, useRef } from 'react'
import { api, getErrorMessage } from '../api/client'
import { maskCpfCnpj, maskCEP, maskPhone, isValidEmail } from '../utils/masks'
import Toast, { ToastMessage } from './Toast'
import Pagination, { usePagination } from './Pagination'
import { Button, EmptyRow, Field, FONT, FormGrid, FormRow, inputStyle, Modal, PageContainer, PageHeader, RADIUS, SPACE, Table, TableShell, Td, Th, THeadRow, Tr } from '../ui'

const initialClientes = [
  {
    id: 'c1',
    tipo: 'PF',
    nome: 'Fernanda Oliveira',
    cpfCnpj: '321.654.987-00',
    email: 'fernanda.oliveira@email.com',
    telefone: '(11) 98765-4321',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 321.654.987-00, residente e domiciliada na Praça da Sé, nº 100, Sé, São Paulo/SP, CEP 01001-000'
  },
  {
    id: 'c2',
    tipo: 'PF',
    nome: 'Roberto Souza',
    cpfCnpj: '123.456.789-11',
    email: 'roberto.souza@email.com',
    telefone: '(11) 97654-3210',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'brasileiro, casado, engenheiro civil, inscrito no CPF sob o nº 123.456.789-11, residente e domiciliado na Rua Vergueiro, nº 500, Vila Mariana, São Paulo/SP, CEP 04001-000'
  },
  {
    id: 'c3',
    tipo: 'PJ',
    nome: 'Construtora Alfa',
    cpfCnpj: '12.345.678/0001-99',
    email: 'contato@construtoraalfa.com.br',
    telefone: '(11) 3344-5566',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 12.345.678/0001-99, com sede na Avenida Paulista, nº 1500, Conj 81, Bela Vista, São Paulo/SP, CEP 01310-100'
  },
  {
    id: 'c4',
    tipo: 'PF',
    nome: 'Lúcia Ferreira',
    cpfCnpj: '456.789.012-33',
    email: 'lucia.ferreira@email.com',
    telefone: '(11) 96543-2109',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'brasileira, viúva, aposentada, inscrita no CPF sob o nº 456.789.012-33, residente e domiciliada na Rua Teodoro Sampaio, nº 800, Pinheiros, São Paulo/SP, CEP 05401-000'
  },
  {
    id: 'c5',
    tipo: 'PJ',
    nome: 'Indústria Metalúrgica Sul',
    cpfCnpj: '98.765.432/0001-10',
    email: 'diretoria@metalsul.com.br',
    telefone: '(11) 4004-9988',
    cidade: 'Santo André',
    uf: 'SP',
    qualificacao: 'pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 98.765.432/0001-10, com sede na Avenida Industrial, nº 2000, Santo André/SP, CEP 09010-000'
  }
]

export default function Clientes() {
  const [clientes, setClientes] = useState<any[]>(initialClientes)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'Todos' | 'PF' | 'PJ'>('Todos')
  const [showModal, setShowModal] = useState(false)

  // Sistema de Mensageria / Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4500)
  }
  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // Formulário
  const [tipo, setTipo] = useState<'PF' | 'PJ'>('PF')
  const [nome, setNome] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [qualificacao, setQualificacao] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')

  // Erros de validação inline
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Estado de consulta do ViaCEP
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [cepMsg, setCepMsg] = useState('')

  const formRef = useRef<HTMLFormElement>(null)

  // Fase 8A — Documentos do Cliente (detalhe/edição)
  const [selected, setSelected] = useState<any | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [docs, setDocs] = useState<any[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadLabel, setUploadLabel] = useState('')
  const [docToDelete, setDocToDelete] = useState<any | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Fase 8B — storage do escritório (barra de progresso + trava de upload).
  const [storageUsado, setStorageUsado] = useState(0)
  const [storageLimite, setStorageLimite] = useState(0)

  // Somente admin pode excluir documentos (backend também valida).
  let isAdmin = false
  try {
    const me = JSON.parse(localStorage.getItem('smartjuris_user') || '{}')
    isAdmin = me?.role === 'admin'
  } catch { /* cache ausente */ }

  const formatDateTime = (v?: string | null) => {
    if (!v) return '—'
    try {
      return new Date(v).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return '—'
    }
  }

  const statusMeta = (s: string) => {
    switch (s) {
      case 'indexed':    return { label: 'Indexado',    bg: 'var(--color-success-light)', color: 'var(--color-success)' }
      case 'failed':     return { label: 'Falhou',      bg: 'var(--color-danger-light)',  color: 'var(--color-danger)' }
      case 'processing': return { label: 'Processando', bg: 'var(--color-warning-light)', color: 'var(--color-warning)' }
      case 'pending':    return { label: 'Pendente',    bg: 'var(--color-warning-light)', color: 'var(--color-warning)' }
      case 'unscoped':   return { label: 'Sem escopo',  bg: 'var(--color-surface-2)',     color: 'var(--color-muted)' }
      default:           return { label: s || '—',      bg: 'var(--color-surface-2)',     color: 'var(--color-muted)' }
    }
  }

  // Fase 8B — métricas de storage: % usado e cor dinâmica (verde < 70%,
  // amarelo 70–90%, vermelho > 90%). Trava o upload quando o limite é atingido.
  const storagePct = storageLimite > 0 ? Math.min(100, (storageUsado / storageLimite) * 100) : 0
  const storageColor = storagePct < 70
    ? 'var(--color-success)'
    : storagePct <= 90
      ? 'var(--color-warning)'
      : 'var(--color-danger)'
  const storageFull = storageLimite > 0 && storageUsado >= storageLimite

  const openDetail = async (c: any) => {
    setSelected(c)
    setDetailOpen(true)
    setDocs([])
    setDocsLoading(true)
    try {
      const data = await api.documentos.listByCliente(c.id)
      setDocs(Array.isArray(data) ? data : (data?.documentos ?? []))
      setStorageUsado(Number(data?.storageUsado ?? 0))
      setStorageLimite(Number(data?.storageLimite ?? 0))
    } catch (e) {
      console.error(e)
      setDocs([])
      setStorageUsado(0)
      setStorageLimite(0)
      addToast('error', 'Não foi possível carregar os documentos do cliente.')
    } finally {
      setDocsLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setSelected(null)
    setDocToDelete(null)
  }

  const loadDocs = async () => {
    if (!selected) return
    setDocsLoading(true)
    try {
      const data = await api.documentos.listByCliente(selected.id)
      setDocs(Array.isArray(data) ? data : (data?.documentos ?? []))
      setStorageUsado(Number(data?.storageUsado ?? 0))
      setStorageLimite(Number(data?.storageLimite ?? 0))
    } catch (e) {
      console.error(e)
      addToast('error', 'Não foi possível carregar os documentos do cliente.')
    } finally {
      setDocsLoading(false)
    }
  }

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-selecionar o mesmo arquivo depois
    if (!file || !selected) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      addToast('error', 'Somente arquivos PDF são permitidos.')
      return
    }
    setUploading(true)
    setUploadProgress(5)
    setUploadLabel('Enviando e indexando documento...')
    const timer = window.setInterval(() => {
      setUploadProgress(p => Math.min(p + 8, 90))
    }, 160)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('colecao', 'clientes')
      formData.append('clienteId', selected.id)
      const res = await api.documentos.upload(formData)
      window.clearInterval(timer)
      if (!res.ok) {
        setUploadProgress(0)
        addToast('error', await getErrorMessage(res, 'Erro ao anexar documento.'))
      } else {
        setUploadProgress(100)
        setUploadLabel('Documento anexado e indexado!')
        addToast('success', 'Documento anexado e indexado com sucesso!')
        loadDocs()
      }
    } catch (err) {
      window.clearInterval(timer)
      setUploadProgress(0)
      console.error(err)
      addToast('error', 'Erro ao anexar documento.')
    } finally {
      window.setTimeout(() => { setUploading(false); setUploadProgress(0) }, 400)
    }
  }

  const confirmDeleteDoc = async () => {
    if (!docToDelete) return
    try {
      const res = await api.documentos.delete(docToDelete.id)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao excluir documento.'))
        return
      }
      addToast('success', 'Documento excluído com sucesso.')
      setDocToDelete(null)
      loadDocs()
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao excluir documento.')
    }
  }

  const loadClientes = async () => {
    setLoading(true)
    try {
      const data = await api.clientes.list()
      if (Array.isArray(data)) setClientes(data)
    } catch (e) {
      console.error(e)
      setClientes([])
      addToast('error', 'Não foi possível carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClientes()
  }, [])

  // Função para buscar endereço por CEP na API publica ViaCEP
  const handleBuscarCep = async (cepInput: string) => {
    const masked = maskCEP(cepInput)
    setCep(masked)
    const cleanCep = masked.replace(/\D/g, '')
    if (cleanCep.length === 8) {
      setBuscandoCep(true)
      setCepMsg('Buscando endereço via ViaCEP...')
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        const data = await res.json()
        if (!data.erro) {
          setLogradouro(data.logradouro || '')
          setBairro(data.bairro || '')
          setCidade(data.localidade || '')
          setUf(data.uf || '')
          setCepMsg('✅ Endereço localizado!')
        } else {
          setCepMsg('⚠️ CEP não encontrado.')
        }
      } catch (err) {
        console.error('Erro na consulta ViaCEP:', err)
        setCepMsg('⚠️ Erro ao consultar o ViaCEP.')
      } finally {
        setBuscandoCep(false)
      }
    } else {
      setCepMsg('')
    }
  }

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validação estrita dos campos obrigatórios
    const newErrors: Record<string, string> = {}
    if (tipo === 'PF' && dataNascimento && new Date(dataNascimento) > new Date()) {
      newErrors.dataNascimento = 'A data de nascimento não pode ser futura.'
    }
    if (!nome.trim()) newErrors.nome = 'O Nome / Razão Social é obrigatório.'
    if (!cpfCnpj.trim()) newErrors.cpfCnpj = `O ${tipo === 'PF' ? 'CPF' : 'CNPJ'} é obrigatório.`
    if (email.trim() && !isValidEmail(email)) newErrors.email = 'Insira um e-mail válido.'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      const msg = Object.values(newErrors)[0]
      addToast('error', msg)
      return
    }

    setErrors({})

    const qualifText = qualificacao.trim() || (tipo === 'PF' 
      ? `brasileiro(a), inscrito(a) no CPF sob o nº ${cpfCnpj}, residente e domiciliado(a) na ${logradouro || 'Rua'}, nº ${numero || 'S/N'}, ${bairro || 'Bairro'}, ${cidade || 'São Paulo'}/${uf || 'SP'}, CEP ${cep || '00000-000'}`
      : `pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${cpfCnpj}, com sede na ${logradouro || 'Rua'}, nº ${numero || 'S/N'}, ${bairro || 'Bairro'}, ${cidade || 'São Paulo'}/${uf || 'SP'}`)

    try {
      const res = await api.clientes.create({
        tipo,
        nome,
        cpfCnpj,
        email,
        telefone,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        qualificacao: qualifText,
        dataNascimento: tipo === 'PF' ? dataNascimento : undefined
      })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao salvar cliente no banco de dados.'))
        return
      }
      setShowModal(false)
      resetForm()
      addToast('success', 'Cliente cadastrado com sucesso!')
      loadClientes()
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao salvar cliente no banco de dados.')
    }
  }

  const handleDeleteCliente = async (id: string) => {
    try {
      const res = await api.clientes.delete(id)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao remover cliente.'))
        return
      }
      addToast('info', 'Cliente removido.')
      loadClientes()
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao remover cliente.')
    }
  }

  const resetForm = () => {
    setTipo('PF')
    setNome('')
    setCpfCnpj('')
    setEmail('')
    setTelefone('')
    setCep('')
    setLogradouro('')
    setNumero('')
    setComplemento('')
    setBairro('')
    setCidade('')
    setUf('')
    setQualificacao('')
    setDataNascimento('')
    setCepMsg('')
  }

  const filtered = clientes.filter(c => {
    const matchTipo = tipoFilter === 'Todos' || c.tipo === tipoFilter
    const matchSearch = !search || c.nome.toLowerCase().includes(search.toLowerCase()) || (c.cpfCnpj && c.cpfCnpj.includes(search))
    return matchTipo && matchSearch
  })

  const clientesPagination = usePagination(filtered, 10)

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xxl }}>
      {/* Header */}
      <PageHeader
        eyebrow="CADASTRO E PRONTUÁRIO DE CLIENTES"
        title="Gestão de Clientes"
        description="Cadastro unificado de pessoas físicas e jurídicas com consulta automática de CEP via ViaCEP."
        action={
          <Button onClick={() => { resetForm(); setShowModal(true); }}>+ Novo Cliente</Button>
        }
      />

      {/* Barra de Filtros */}
      <div style={{ display: 'flex', gap: SPACE.md, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <input
            type="text"
            placeholder="Buscar por nome, CPF ou CNPJ..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle(), paddingLeft: 36 }}
          />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: FONT.md }}>🔍</span>
        </div>

        <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' }}>
          {(['Todos', 'PF', 'PJ'] as const).map(t => (
            <Button
              key={t}
              size="sm"
              variant={tipoFilter === t ? 'primary' : 'secondary'}
              onClick={() => setTipoFilter(t)}
              style={tipoFilter === t ? undefined : { color: 'var(--color-muted)' }}
            >
              {t === 'Todos' ? 'Todos os Clientes' : t === 'PF' ? 'Pessoa Física (PF)' : 'Pessoa Jurídica (PJ)'}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabela de Clientes */}
      <TableShell>
        <Table style={{ minWidth: 760 }}>
          <THeadRow>
            {['Tipo', 'Nome do Cliente', 'CPF / CNPJ', 'Contato / Email', 'Endereço (Cidade/UF)', 'Ações'].map(h => (
              <Th key={h}>{h}</Th>
            ))}
          </THeadRow>
          <tbody>
            {loading ? (
              <EmptyRow colSpan={6} message="Carregando clientes..." />
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={6} message="Nenhum cliente cadastrado." />
            ) : (
              clientesPagination.pageItems.map(c => (
                <Tr key={c.id} onClick={() => openDetail(c)} style={{ cursor: 'pointer' }}>
                  <Td>
                    <span style={{ fontSize: FONT.xs, fontWeight: 700, padding: '3px 8px', borderRadius: RADIUS.chip, background: c.tipo === 'PF' ? 'var(--color-primary)' : 'var(--color-accent)', color: 'var(--color-on-primary)' }}>
                      {c.tipo}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ fontSize: FONT.md, fontWeight: 600 }}>{c.nome}</div>
                    {c.qualificacao && <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginTop: 2, maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.qualificacao}</div>}
                  </Td>
                  <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.base }}>{c.cpfCnpj}</Td>
                  <Td>
                    <div style={{ fontSize: FONT.base }}>{c.email}</div>
                    <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{c.telefone}</div>
                  </Td>
                  <Td style={{ fontSize: FONT.base }}>
                    {c.cidade ? `${c.cidade}/${c.uf}` : '—'}
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: SPACE.xs }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        ariaLabel="Documentos do cliente"
                        title="Documentos do cliente"
                        onClick={(e) => { e.stopPropagation(); openDetail(c); }}
                      >📄</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        ariaLabel="Excluir cliente"
                        title="Excluir cliente"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCliente(c.id); }}
                      >×</Button>
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
        <Pagination {...clientesPagination} onPageChange={clientesPagination.setPage} />
      </TableShell>

      {/* Modal de Novo Cliente com ViaCEP */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Cadastrar Novo Cliente"
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={() => formRef.current?.requestSubmit()}>Salvar Cliente</Button>
          </>
        }
      >
        <form ref={formRef} onSubmit={handleSaveCliente} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          {/* Tipo PF ou PJ */}
          <div style={{ display: 'flex', gap: SPACE.md }}>
            <Button
              type="button"
              variant={tipo === 'PF' ? 'primary' : 'secondary'}
              onClick={() => setTipo('PF')}
              style={{ flex: 1 }}
            >
              👤 Pessoa Física (PF)
            </Button>
            <Button
              type="button"
              variant={tipo === 'PJ' ? 'primary' : 'secondary'}
              onClick={() => setTipo('PJ')}
              style={{ flex: 1 }}
            >
              🏢 Pessoa Jurídica (PJ)
            </Button>
          </div>

          <FormGrid>
            <FormRow span>
              <Field label="Nome completo ou razão social" required error={errors.nome}>
                <input
                  type="text"
                  placeholder="Ex: Fernanda Oliveira"
                  value={nome}
                  onChange={e => {
                    setNome(e.target.value)
                    if (errors.nome) setErrors(prev => ({ ...prev, nome: '' }))
                  }}
                  style={inputStyle(!!errors.nome)}
                />
              </Field>
            </FormRow>

            <FormRow>
              <Field label={tipo === 'PF' ? 'CPF' : 'CNPJ'} required error={errors.cpfCnpj}>
                <input
                  type="text"
                  placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0001-00'}
                  value={cpfCnpj}
                  onChange={e => {
                    setCpfCnpj(maskCpfCnpj(e.target.value, tipo))
                    if (errors.cpfCnpj) setErrors(prev => ({ ...prev, cpfCnpj: '' }))
                  }}
                  style={{ ...inputStyle(!!errors.cpfCnpj), fontFamily: 'var(--font-mono)' }}
                />
              </Field>
            </FormRow>

            <FormRow>
              <Field label="Telefone / WhatsApp">
                <input
                  type="text"
                  placeholder="(11) 98877-6655"
                  value={telefone}
                  onChange={e => setTelefone(maskPhone(e.target.value))}
                  style={inputStyle()}
                />
              </Field>
            </FormRow>

            <FormRow span={tipo === 'PJ'}>
              <Field label="E-mail institucional" error={errors.email}>
                <input
                  type="email"
                  placeholder="cliente@email.com"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value)
                    if (errors.email) setErrors(prev => ({ ...prev, email: '' }))
                  }}
                  style={inputStyle(!!errors.email)}
                />
              </Field>
            </FormRow>

            {tipo === 'PF' && (
              <FormRow>
                <Field label="Data de Nascimento" error={errors.dataNascimento}>
                  <input
                    type="date"
                    value={dataNascimento}
                    onChange={e => {
                      setDataNascimento(e.target.value)
                      if (errors.dataNascimento) setErrors(prev => ({ ...prev, dataNascimento: '' }))
                    }}
                    style={inputStyle(!!errors.dataNascimento)}
                  />
                </Field>
              </FormRow>
            )}
          </FormGrid>

          {/* Seção Endereço com Busca por CEP via ViaCEP */}
          <div style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', padding: SPACE.lg, borderRadius: RADIUS.control, display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: FONT.sm, fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em' }}>📍 ENDEREÇO (CONSULTA VIA VIACEP)</label>
              {cepMsg && <span style={{ fontSize: FONT.sm, color: 'var(--color-primary)', fontWeight: 500 }}>{cepMsg}</span>}
            </div>

            <FormGrid style={{ gap: SPACE.sm }}>
              <FormRow>
                <input type="text" placeholder="CEP (00000-000)" value={cep} onChange={e => handleBuscarCep(e.target.value)} style={{ ...inputStyle(), fontFamily: 'var(--font-mono)' }} />
              </FormRow>
              <FormRow>
                <input type="text" placeholder="Número" value={numero} onChange={e => setNumero(e.target.value)} style={inputStyle()} />
              </FormRow>
              <FormRow span>
                <input type="text" placeholder="Rua / Avenida / Logradouro" value={logradouro} onChange={e => setLogradouro(e.target.value)} style={inputStyle()} />
              </FormRow>
              <FormRow span>
                <input type="text" placeholder="Bairro" value={bairro} onChange={e => setBairro(e.target.value)} style={inputStyle()} />
              </FormRow>
              <FormRow>
                <input type="text" placeholder="Cidade / Município" value={cidade} onChange={e => setCidade(e.target.value)} style={inputStyle()} />
              </FormRow>
              <FormRow>
                <input type="text" placeholder="UF" value={uf} onChange={e => setUf(e.target.value)} style={{ ...inputStyle(), textTransform: 'uppercase' }} />
              </FormRow>
            </FormGrid>
          </div>

          <Field label="Qualificação jurídica completa para petições (autopreenchida)">
            <textarea
              value={qualificacao}
              onChange={e => setQualificacao(e.target.value)}
              placeholder="Ex: brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 000.000.000-00..."
              rows={2}
              style={{ ...inputStyle(), fontSize: FONT.sm, resize: 'vertical' }}
            />
          </Field>
        </form>
      </Modal>

      {/* Fase 8A — Detalhe do Cliente + Documentos do Cliente */}
      <Modal
        open={detailOpen}
        onClose={closeDetail}
        title={selected ? `Cliente — ${selected.nome}` : 'Detalhes do Cliente'}
        width={860}
        footer={<Button variant="secondary" onClick={closeDetail}>Fechar</Button>}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
            {/* Resumo do cliente */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.lg, padding: SPACE.lg, background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card }}>
              <div>
                <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Tipo</div>
                <span style={{ fontSize: FONT.xs, fontWeight: 700, padding: '3px 8px', borderRadius: RADIUS.chip, background: selected.tipo === 'PF' ? 'var(--color-primary)' : 'var(--color-accent)', color: 'var(--color-on-primary)' }}>{selected.tipo}</span>
              </div>
              <div>
                <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>CPF / CNPJ</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.md }}>{selected.cpfCnpj}</div>
              </div>
              <div>
                <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Contato</div>
                <div style={{ fontSize: FONT.md }}>{selected.email || '—'}</div>
                <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{selected.telefone || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Endereço</div>
                <div style={{ fontSize: FONT.md }}>{selected.cidade ? `${selected.cidade}/${selected.uf}` : '—'}</div>
              </div>
            </div>

            {/* Seção Documentos do Cliente */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: SPACE.lg, flexWrap: 'wrap', gap: SPACE.md }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: FONT.md }}>Documentos do Cliente</div>
                  <div style={{ color: 'var(--color-muted)', fontSize: FONT.sm, marginTop: 2 }}>
                    {docs.length} documento(s) anexado(s) e indexado(s) na base RAG (PDF)
                  </div>
                </div>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || storageFull}
                  title={storageFull ? 'Limite de storage de 1 GB atingido.' : undefined}
                >+ Anexar Documento</Button>
              </div>

              {/* Fase 8B — barra de storage do escritório (1 GB) */}
              {storageLimite > 0 && (
                <div style={{ marginBottom: SPACE.lg, padding: '12px 16px', background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: SPACE.sm }}>
                    <div style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-foreground)' }}>Storage do Escritório</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: storageFull ? 'var(--color-danger)' : 'var(--color-muted)' }}>
                      {(storageUsado / (1024 * 1024)).toFixed(1)} MB / 1 GB
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${storagePct}%`, height: '100%', background: storageColor, borderRadius: 3, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                style={{ display: 'none' }}
                onChange={handleUploadDoc}
              />

              {(uploading || uploadProgress > 0) && (
                <div style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: RADIUS.card, padding: '14px 20px', marginBottom: SPACE.lg,
                }}>
                  <div style={{ fontWeight: 600, fontSize: FONT.md, marginBottom: 10 }}>Enviando documento...</div>
                  <div style={{ height: 5, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden', marginBottom: SPACE.sm }}>
                    <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--color-primary)', borderRadius: 3, transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: 'var(--color-muted)' }}>{uploadLabel}</div>
                </div>
              )}

              <TableShell>
                <Table style={{ minWidth: 640 }}>
                  <THeadRow>
                    {['Nome', 'Tamanho', 'Área', 'Status de Indexação', 'Data de Upload', 'Ações'].map(h => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </THeadRow>
                  <tbody>
                    {docsLoading ? (
                      <EmptyRow colSpan={6} message="Carregando documentos..." />
                    ) : docs.length === 0 ? (
                      <EmptyRow colSpan={6} message="Nenhum documento anexado a este cliente ainda." />
                    ) : (
                      docs.map(d => {
                        const st = statusMeta(d.indexedStatus)
                        return (
                          <Tr key={d.id}>
                            <Td style={{ fontWeight: 600 }}>{d.nome}</Td>
                            <Td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{d.tamanho}</Td>
                            <Td>{d.area || '—'}</Td>
                            <Td>
                              <span style={{ fontSize: FONT.xs, fontWeight: 700, padding: '3px 8px', borderRadius: RADIUS.chip, background: st.bg, color: st.color }}>
                                {st.label}
                              </span>
                            </Td>
                            <Td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', fontSize: FONT.sm }}>
                              {formatDateTime(d.createdAt || d.indexado)}
                            </Td>
                            <Td>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  ariaLabel="Excluir documento"
                                  title="Excluir documento"
                                  onClick={() => setDocToDelete(d)}
                                >🗑️</Button>
                              )}
                            </Td>
                          </Tr>
                        )
                      })
                    )}
                  </tbody>
                </Table>
              </TableShell>
            </div>
          </div>
        )}
      </Modal>

      {/* Fase 8A — Confirmação de exclusão de documento */}
      <Modal
        open={!!docToDelete}
        onClose={() => setDocToDelete(null)}
        title="Excluir documento"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDocToDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDeleteDoc}>Excluir</Button>
          </>
        }
      >
        <p style={{ fontSize: FONT.md, lineHeight: 1.6, margin: 0 }}>
          Tem certeza que deseja excluir <strong>{docToDelete?.nome}</strong>?
          Os chunks indexados na base RAG também serão removidos. Esta ação não pode ser desfeita.
        </p>
      </Modal>

      {/* Componente Toast de Mensageria Flutuante */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </PageContainer>
  )
}
