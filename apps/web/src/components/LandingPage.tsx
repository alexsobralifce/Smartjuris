import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import { Button, FONT, Field, inputStyle, RADIUS, SPACE } from '../ui'
import { useBreakpoint } from '../hooks/useBreakpoint'
import PricingSection from './PricingSection'
import ProductionShowcase from './ProductionShowcase'
import TestimonialsSection from './TestimonialsSection'
import lawyersImg from '../assets/lawyers_operating_smartjuris.jpg'

// Tipografia do hero — exceção de marketing permitida (46px).
const HERO_FONT_SIZE = 46

// UFs brasileiras para o cadastro da OAB (registro nacional).
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

// Máscaras: mantêm apenas os dígitos e reformatam, o que suporta colagem
// (onChange recebe o texto inteiro) e nunca "trava" o backspace (um caractere a menos = um dígito a menos).
const onlyDigits = (v: string) => v.replace(/\D/g, '')

const maskCnpj = (v: string): string => {
  const d = onlyDigits(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

const maskTelefone = (v: string): string => {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: FONT.xs,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  paddingBottom: SPACE.xs,
  borderBottom: '1px solid var(--color-border)',
}

interface CadastroValues {
  nome: string
  email: string
  senha: string
  confirmarSenha: string
  oab: string
  oabUf: string
  escritorioNome: string
  cnpj: string
  telefone: string
}

const CADASTRO_INICIAL: CadastroValues = {
  nome: '', email: '', senha: '', confirmarSenha: '', oab: '', oabUf: '', escritorioNome: '', cnpj: '', telefone: '',
}

interface LandingPageProps {
  onLoginSuccess: (user: { name: string; role: string; email: string }) => void
}

function CadastroSucesso({ onBackToLogin }: { onBackToLogin: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      padding: '12px 0 4px', gap: SPACE.lg,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--color-success-light)',
        border: '2px solid var(--color-success)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 13l4 4L19 7" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-foreground)' }}>
          Cadastro concluído!
        </div>
        <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', lineHeight: 1.5 }}>
          Cadastro confirmado com sucesso. Seu acesso já está <strong style={{ color: 'var(--color-success)' }}>ativo</strong> — os créditos de uso serão concedidos pelo administrador da plataforma.
        </div>
      </div>

      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: RADIUS.control,
        padding: '14px 18px',
        fontSize: FONT.sm,
        color: 'var(--color-foreground)',
        lineHeight: 1.5,
        textAlign: 'left',
        width: '100%',
      }}>
        <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: 2 }}>📧 Acompanhe seus créditos:</div>
        Seu acesso já está ativo — você já pode entrar com seu e-mail e senha. Os créditos de uso serão concedidos pelo administrador da plataforma.
      </div>

      <Button onClick={onBackToLogin} style={{ width: '100%', padding: '12px' }}>
        Ir para a Tela de Login →
      </Button>
    </div>
  )
}

function CadastroVerificacao({
  email,
  onSuccess,
  onBack,
}: {
  email: string
  onSuccess: () => void
  onBack: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(60)
  const [resendMsg, setResendMsg] = useState('')

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResendMsg('')
    const clean = codigo.replace(/\D/g, '').trim()
    if (clean.length !== 6) {
      setError('Digite o código de 6 dígitos numéricos.')
      return
    }

    setLoading(true)
    try {
      const res = await api.auth.verificarCodigo(email, clean)
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Código incorreto ou expirado.'))
        return
      }
      onSuccess()
    } catch (err: any) {
      setError(err?.message || 'Falha ao validar código. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0 || resending) return
    setResending(true)
    setError('')
    setResendMsg('')
    try {
      const res = await api.auth.reenviarCodigo(email)
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Falha ao reenviar código.'))
        return
      }
      setResendMsg('Novo código enviado com sucesso para o seu e-mail!')
      setCooldown(60)
    } catch (err: any) {
      setError(err?.message || 'Erro ao reenviar código.')
    } finally {
      setResending(false)
    }
  }

  return (
    <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: 8 }}>📩</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, fontWeight: 700, letterSpacing: '-0.02em' }}>
          Confirme seu E-mail
        </div>
        <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginTop: 4, lineHeight: 1.5 }}>
          Enviamos um código de 6 dígitos para:<br />
          <strong style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-mono)' }}>{email}</strong>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'var(--color-danger-light)',
          color: 'var(--color-danger)',
          border: '1px solid var(--color-border)',
          borderRadius: RADIUS.control,
          padding: '12px 14px',
          fontSize: FONT.base,
          fontWeight: 500,
        }}>
          ⚠️ {error}
        </div>
      )}

      {resendMsg && (
        <div style={{
          background: 'var(--color-success-light)',
          color: 'var(--color-success)',
          border: '1px solid var(--color-success)',
          borderRadius: RADIUS.control,
          padding: '10px 14px',
          fontSize: FONT.sm,
          fontWeight: 500,
        }}>
          ✓ {resendMsg}
        </div>
      )}

      <Field label="Código de 6 dígitos (OTP)" error={error ? ' ' : undefined} required>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="000000"
          value={codigo}
          onChange={e => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 6)
            setCodigo(val)
            if (error) setError('')
          }}
          autoFocus
          style={{
            ...inputStyle(!!error),
            fontFamily: 'var(--font-mono)',
            fontSize: '24px',
            textAlign: 'center',
            letterSpacing: '0.35em',
            padding: '12px',
            fontWeight: 700,
          }}
        />
      </Field>

      <Button
        type="submit"
        disabled={loading || codigo.length !== 6}
        style={{ width: '100%', padding: '13px' }}
      >
        {loading ? 'Validando Código…' : 'Validar e Concluir Cadastro →'}
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: FONT.sm, marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          style={{
            background: 'transparent',
            border: 'none',
            color: cooldown > 0 ? 'var(--color-muted)' : 'var(--color-primary)',
            fontWeight: 600,
            cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
            padding: 0,
          }}
        >
          {resending ? 'Reenviando…' : cooldown > 0 ? `Reenviar código em ${cooldown}s` : '🔄 Reenviar código'}
        </button>

        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-muted)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ← Voltar / Corrigir dados
        </button>
      </div>
    </form>
  )
}

function CadastroForm({
  isMobile,
  values,
  onValuesChange,
  onCodeSent,
  onAutoVerified,
}: {
  isMobile: boolean
  values: CadastroValues
  onValuesChange: (v: CadastroValues) => void
  onCodeSent: (email: string) => void
  onAutoVerified: () => void
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof CadastroValues, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof CadastroValues, boolean>>>({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = (v: CadastroValues): Partial<Record<keyof CadastroValues, string>> => {
    const e: Partial<Record<keyof CadastroValues, string>> = {}
    if (!v.nome.trim()) e.nome = 'Informe seu nome completo.'
    if (!v.email.trim()) e.email = 'Informe seu e-mail.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'E-mail inválido.'
    if (!v.senha) e.senha = 'Informe uma senha.'
    else if (v.senha.length < 8) e.senha = 'A senha deve ter no mínimo 8 caracteres.'
    if (!v.confirmarSenha) e.confirmarSenha = 'Confirme sua senha.'
    else if (v.confirmarSenha !== v.senha) e.confirmarSenha = 'As senhas não coincidem.'
    if (!v.oab.trim()) e.oab = 'Informe o número da OAB.'
    else if (v.oab.trim().length < 4) e.oab = 'Número da OAB inválido.'
    if (!v.oabUf) e.oabUf = 'Selecione a UF.'
    if (!v.escritorioNome.trim()) e.escritorioNome = 'Informe o nome do escritório.'
    return e
  }

  const setField = (field: keyof CadastroValues, raw: string, transform?: (v: string) => string) => {
    const next = transform ? transform(raw) : raw
    const updated = { ...values, [field]: next }
    onValuesChange(updated)
    if (touched[field]) {
      const nextErrors = validate(updated)
      setErrors(prev => ({ ...prev, [field]: nextErrors[field] }))
    }
  }

  const handleBlur = (field: keyof CadastroValues) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    const nextErrors = validate(values)
    setErrors(prev => ({ ...prev, [field]: nextErrors[field] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validate(values)
    setErrors(nextErrors)
    const allTouched = (Object.keys(CADASTRO_INICIAL) as (keyof CadastroValues)[]).reduce<Partial<Record<keyof CadastroValues, boolean>>>((acc, k) => {
      acc[k] = true
      return acc
    }, {})
    setTouched(allTouched)
    if (Object.keys(nextErrors).length > 0) return

    setLoading(true)
    try {
      const res = await api.auth.registro({
        nome: values.nome.trim(),
        email: values.email.trim(),
        senha: values.senha,
        oab: values.oab.trim(),
        oabUf: values.oabUf.toUpperCase(),
        escritorioNome: values.escritorioNome.trim(),
        cnpj: values.cnpj ? onlyDigits(values.cnpj) : undefined,
        telefone: values.telefone ? onlyDigits(values.telefone) : undefined,
      })
      if (!res.ok) {
        setSubmitError(await getErrorMessage(res, 'Não foi possível concluir o cadastro. Tente novamente.'))
        return
      }
      // Por padrão o backend dispensa a verificação por e-mail (sem código OTP)
      // e responde step:'ok' → segue direto para a tela de sucesso. A tela de
      // código só é usada se o backend responder step:'verificacao'
      // (futuro, com REQUIRE_EMAIL_OTP=true).
      let step = 'verificacao'
      try {
        const data = await res.clone().json()
        step = data?.step || 'verificacao'
      } catch { /* corpo indisponível; assume verificação por código */ }
      if (step === 'ok') {
        onAutoVerified()
      } else {
        onCodeSent(values.email.trim())
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Não foi possível concluir o cadastro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: SPACE.md,
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
      {submitError && (
        <div style={{
          background: 'var(--color-danger-light)',
          color: 'var(--color-danger)',
          border: '1px solid var(--color-border)',
          borderRadius: RADIUS.control,
          padding: '12px 14px',
          fontSize: FONT.base,
          fontWeight: 500,
        }}>
          ⚠️ {submitError}
        </div>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <div style={sectionLabelStyle}>Dados do advogado</div>
        <div style={gridStyle}>
          <Field label="Nome completo" error={errors.nome} required>
            <input type="text" autoComplete="name" placeholder="Maria Silva" value={values.nome}
              onChange={e => setField('nome', e.target.value)} onBlur={() => handleBlur('nome')}
              style={inputStyle(!!errors.nome)} />
          </Field>
          <Field label="E-mail" error={errors.email} required>
            <input type="email" autoComplete="email" placeholder="voce@escritorio.com" value={values.email}
              onChange={e => setField('email', e.target.value)} onBlur={() => handleBlur('email')}
              style={inputStyle(!!errors.email)} />
          </Field>
          <Field label="Senha" error={errors.senha} required>
            <input type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={values.senha}
              onChange={e => setField('senha', e.target.value)} onBlur={() => handleBlur('senha')}
              style={inputStyle(!!errors.senha)} />
          </Field>
          <Field label="Confirmar senha" error={errors.confirmarSenha} required>
            <input type="password" autoComplete="new-password" placeholder="Repita a senha" value={values.confirmarSenha}
              onChange={e => setField('confirmarSenha', e.target.value)} onBlur={() => handleBlur('confirmarSenha')}
              style={inputStyle(!!errors.confirmarSenha)} />
          </Field>
          <Field label="Nº OAB" error={errors.oab} required>
            <input type="text" maxLength={20} placeholder="Ex.: 123456" value={values.oab}
              onChange={e => setField('oab', e.target.value)} onBlur={() => handleBlur('oab')}
              style={inputStyle(!!errors.oab)} />
          </Field>
          <Field label="UF da OAB" error={errors.oabUf} required>
            <select value={values.oabUf} onChange={e => setField('oabUf', e.target.value)}
              onBlur={() => handleBlur('oabUf')} style={inputStyle(!!errors.oabUf)}>
              <option value="">Selecione…</option>
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <div style={sectionLabelStyle}>Dados do escritório</div>
        <div style={gridStyle}>
          <Field label="Nome do escritório" error={errors.escritorioNome} required>
            <input type="text" autoComplete="organization" placeholder="Silva & Advogados" value={values.escritorioNome}
              onChange={e => setField('escritorioNome', e.target.value)} onBlur={() => handleBlur('escritorioNome')}
              style={inputStyle(!!errors.escritorioNome)} />
          </Field>
          <Field label="CNPJ (opcional)" error={errors.cnpj}>
            <input type="text" inputMode="numeric" placeholder="00.000.000/0000-00" value={values.cnpj}
              onChange={e => setField('cnpj', e.target.value, maskCnpj)} onBlur={() => handleBlur('cnpj')}
              style={inputStyle(!!errors.cnpj)} />
          </Field>
          <Field label="Telefone (opcional)" error={errors.telefone}>
            <input type="tel" inputMode="tel" placeholder="(00) 00000-0000" value={values.telefone}
              onChange={e => setField('telefone', e.target.value, maskTelefone)} onBlur={() => handleBlur('telefone')}
              style={inputStyle(!!errors.telefone)} />
          </Field>
        </div>
      </section>

      <Button type="submit" disabled={loading} style={{ width: '100%', padding: '13px' }}>
        {loading ? 'Cadastrando…' : 'Concluir Cadastro →'}
      </Button>

      <div style={{
        marginTop: SPACE.md,
        padding: SPACE.md,
        background: 'var(--color-surface-2)',
        borderRadius: RADIUS.control,
        fontSize: FONT.sm,
        color: 'var(--color-muted)',
        lineHeight: 1.5,
      }}>
        <strong style={{ color: 'var(--color-foreground)' }}>Nota:</strong> Ao criar sua conta gratuita, os recursos avançados de IA (geração de peças, análise de documentos, busca de jurisprudência e revisão contratual) estarão limitados. Assine um plano para desbloquear acesso completo.
      </div>

      <p style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
        Seus dados pessoais e do escritório são tratados em conformidade com a LGPD (Lei nº 13.709/2018) e utilizados exclusivamente para a prestação dos serviços da plataforma.
      </p>
    </form>
  )
}

function EsqueciSenha({ onBackToLogin }: { onBackToLogin: () => void }) {
  const [step, setStep] = useState<'email' | 'codigo' | 'sucesso'>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [confirmarEmail, setConfirmarEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; codigo?: string; novaSenha?: string; confirmar?: string; novoEmail?: string; confirmarEmail?: string }>({})

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const validaEmail = (v: string): string | undefined => {
    if (!v.trim()) return 'Informe seu e-mail.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'E-mail inválido.'
    return undefined
  }

  const enviarCodigo = async (): Promise<boolean> => {
    setError('')
    try {
      const res = await api.auth.solicitarResetSenha(email.trim())
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Falha ao enviar o código de recuperação.'))
        return false
      }
      return true
    } catch (err: any) {
      setError(err?.message || 'Falha ao enviar o código de recuperação.')
      return false
    }
  }

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const emailErr = validaEmail(email)
    setFieldErrors({ email: emailErr })
    if (emailErr) return
    setLoading(true)
    const ok = await enviarCodigo()
    setLoading(false)
    if (ok) {
      setNotice('Se o e-mail estiver cadastrado, enviaremos um código de recuperação.')
      setStep('codigo')
      setCooldown(60)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0 || resending) return
    setResending(true)
    setNotice('')
    const ok = await enviarCodigo()
    setResending(false)
    if (ok) {
      setNotice('Novo código enviado. Verifique sua caixa de entrada.')
      setCooldown(60)
    }
  }

  const validateRedefinir = (c: string, n: string, cf: string, ne: string, ce: string) => {
    const fe: typeof fieldErrors = {}
    if (c.replace(/\D/g, '').length !== 6) fe.codigo = 'Digite o código de 6 dígitos.'
    if (!n) fe.novaSenha = 'Informe uma nova senha.'
    else if (n.length < 8) fe.novaSenha = 'A senha deve ter no mínimo 8 caracteres.'
    if (!cf) fe.confirmar = 'Confirme a nova senha.'
    else if (cf !== n) fe.confirmar = 'As senhas não coincidem.'
    if (ne) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ne)) fe.novoEmail = 'E-mail inválido.'
      if (!ce) fe.confirmarEmail = 'Confirme o novo e-mail.'
      else if (ce !== ne) fe.confirmarEmail = 'Os e-mails não coincidem.'
    }
    return fe
  }

  const handleRedefinir = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const fe = validateRedefinir(codigo, novaSenha, confirmar, novoEmail.trim(), confirmarEmail.trim())
    setFieldErrors(fe)
    if (Object.keys(fe).length) return
    setLoading(true)
    try {
      const res = await api.auth.redefinirSenha(
        email.trim(),
        codigo.replace(/\D/g, ''),
        novaSenha,
        novoEmail.trim() || undefined
      )
      if (!res.ok) {
        setError(await getErrorMessage(res, 'Falha ao redefinir a senha.'))
        return
      }
      setStep('sucesso')
    } catch (err: any) {
      setError(err?.message || 'Falha ao redefinir a senha.')
    } finally {
      setLoading(false)
    }
  }

  const errorBlock = error ? (
    <div style={{
      background: 'var(--color-danger-light)',
      color: 'var(--color-danger)',
      border: '1px solid var(--color-border)',
      borderRadius: RADIUS.control,
      padding: '12px 14px',
      fontSize: FONT.base,
      fontWeight: 500,
    }}>
      ⚠️ {error}
    </div>
  ) : null

  const noticeBlock = notice ? (
    <div style={{
      background: 'var(--color-success-light)',
      color: 'var(--color-success)',
      border: '1px solid var(--color-success)',
      borderRadius: RADIUS.control,
      padding: '10px 14px',
      fontSize: FONT.sm,
      fontWeight: 500,
    }}>
      ✓ {notice}
    </div>
  ) : null

  if (step === 'sucesso') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: '12px 0 4px', gap: SPACE.lg,
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: 'var(--color-success-light)',
          border: '1px solid var(--color-success)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 13l4 4L19 7" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, letterSpacing: '-0.02em', margin: 0 }}>
          Senha redefinida
        </h3>
        <p style={{ fontSize: FONT.base, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
          Senha redefinida com sucesso. Faça login com a nova senha.
        </p>
        <Button onClick={onBackToLogin} style={{ width: '100%', padding: '12px', marginTop: SPACE.xs }}>
          Voltar ao login
        </Button>
      </div>
    )
  }

  if (step === 'email') {
    return (
      <form onSubmit={handleEnviar} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: 8 }}>🔑</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Recuperar senha
          </div>
          <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginTop: 4, lineHeight: 1.5 }}>
            Informe seu e-mail e enviaremos um código de recuperação.
          </div>
        </div>

        {errorBlock}

        <Field label="E-mail" error={fieldErrors.email} required>
          <input
            type="email"
            autoComplete="email"
            placeholder="voce@escritorio.com"
            value={email}
            onChange={e => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors(f => ({ ...f, email: undefined })) }}
            onBlur={() => setFieldErrors(f => ({ ...f, email: validaEmail(email) }))}
            autoFocus
            style={{ ...inputStyle(!!fieldErrors.email), fontFamily: 'var(--font-mono)' }}
          />
        </Field>

        <Button type="submit" disabled={loading} style={{ width: '100%', padding: '13px' }}>
          {loading ? 'Enviando…' : 'Enviar código de recuperação'}
        </Button>

        <button
          type="button"
          onClick={onBackToLogin}
          style={{
            background: 'transparent', border: 'none', color: 'var(--color-muted)',
            cursor: 'pointer', padding: 0, fontSize: FONT.sm, fontWeight: 500, alignSelf: 'center',
          }}
        >
          ← Voltar ao login
        </button>
      </form>
    )
  }

  // Etapa código + nova senha
  return (
    <form onSubmit={handleRedefinir} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: 8 }}>📩</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, fontWeight: 700, letterSpacing: '-0.02em' }}>
          Redefinir senha
        </div>
        <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginTop: 4, lineHeight: 1.5 }}>
          Enviamos um código de 6 dígitos para:<br />
          <strong style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-mono)' }}>{email}</strong>
        </div>
      </div>

      {noticeBlock}
      {errorBlock}

      <Field label="Código de 6 dígitos" error={fieldErrors.codigo} required>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="000000"
          value={codigo}
          onChange={e => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 6)
            setCodigo(val)
            if (fieldErrors.codigo) setFieldErrors(f => ({ ...f, codigo: undefined }))
          }}
          onBlur={() => setFieldErrors(f => ({ ...f, codigo: validateRedefinir(codigo, novaSenha, confirmar, novoEmail, confirmarEmail).codigo }))}
          autoFocus
          style={{
            ...inputStyle(!!fieldErrors.codigo),
            fontFamily: 'var(--font-mono)',
            fontSize: '24px',
            textAlign: 'center',
            letterSpacing: '0.35em',
            padding: '12px',
            fontWeight: 700,
          }}
        />
      </Field>

      {!novoEmail && (
        <button
          type="button"
          onClick={() => setNovoEmail(' ')}
          style={{
            background: 'transparent',
            border: '1px dashed var(--color-border)',
            color: 'var(--color-muted)',
            cursor: 'pointer',
            padding: '10px',
            fontSize: FONT.sm,
            fontWeight: 500,
            borderRadius: '6px',
            textAlign: 'center',
          }}
        >
          🔄 Trocar e-mail também
        </button>
      )}

      {novoEmail && !novoEmail.trim() && (
        <button
          type="button"
          onClick={() => { setNovoEmail(''); setConfirmarEmail('') }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-muted)',
            cursor: 'pointer',
            padding: '8px',
            fontSize: FONT.sm,
            fontWeight: 500,
            alignSelf: 'flex-end',
          }}
        >
          ✕ Cancelar troca de e-mail
        </button>
      )}

      {novoEmail && (
        <>
          <Field label="Novo e-mail" error={fieldErrors.novoEmail} required>
            <input
              type="email"
              autoComplete="email"
              placeholder="novoemail@exemplo.com"
              value={novoEmail}
              onChange={e => { setNovoEmail(e.target.value); if (fieldErrors.novoEmail) setFieldErrors(f => ({ ...f, novoEmail: undefined })) }}
              onBlur={() => setFieldErrors(f => ({ ...f, novoEmail: validateRedefinir(codigo, novaSenha, confirmar, novoEmail, confirmarEmail).novoEmail }))}
              style={inputStyle(!!fieldErrors.novoEmail)}
            />
          </Field>

          <Field label="Confirmar novo e-mail" error={fieldErrors.confirmarEmail} required>
            <input
              type="email"
              autoComplete="email"
              placeholder="Repita o novo e-mail"
              value={confirmarEmail}
              onChange={e => { setConfirmarEmail(e.target.value); if (fieldErrors.confirmarEmail) setFieldErrors(f => ({ ...f, confirmarEmail: undefined })) }}
              onBlur={() => setFieldErrors(f => ({ ...f, confirmarEmail: validateRedefinir(codigo, novaSenha, confirmar, novoEmail, confirmarEmail).confirmarEmail }))}
              style={inputStyle(!!fieldErrors.confirmarEmail)}
            />
          </Field>
        </>
      )}

      <Field label="Nova senha" error={fieldErrors.novaSenha} required>
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          value={novaSenha}
          onChange={e => { setNovaSenha(e.target.value); if (fieldErrors.novaSenha) setFieldErrors(f => ({ ...f, novaSenha: undefined })) }}
          onBlur={() => setFieldErrors(f => ({ ...f, novaSenha: validateRedefinir(codigo, novaSenha, confirmar, novoEmail, confirmarEmail).novaSenha }))}
          style={inputStyle(!!fieldErrors.novaSenha)}
        />
      </Field>

      <Field label="Confirmar nova senha" error={fieldErrors.confirmar} required>
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Repita a nova senha"
          value={confirmar}
          onChange={e => { setConfirmar(e.target.value); if (fieldErrors.confirmar) setFieldErrors(f => ({ ...f, confirmar: undefined })) }}
          onBlur={() => setFieldErrors(f => ({ ...f, confirmar: validateRedefinir(codigo, novaSenha, confirmar, novoEmail, confirmarEmail).confirmar }))}
          style={inputStyle(!!fieldErrors.confirmar)}
        />
      </Field>

      <Button type="submit" disabled={loading} style={{ width: '100%', padding: '13px' }}>
        {loading ? 'Redefinindo…' : 'Redefinir senha'}
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: FONT.sm, marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          style={{
            background: 'transparent', border: 'none',
            color: cooldown > 0 ? 'var(--color-muted)' : 'var(--color-primary)',
            fontWeight: 600,
            cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
            padding: 0,
          }}
        >
          {resending ? 'Reenviando…' : cooldown > 0 ? `Reenviar código em ${cooldown}s` : '🔄 Reenviar código'}
        </button>

        <button
          type="button"
          onClick={onBackToLogin}
          style={{
            background: 'transparent', border: 'none', color: 'var(--color-muted)',
            cursor: 'pointer', padding: 0,
          }}
        >
          ← Voltar ao login
        </button>
      </div>
    </form>
  )
}

export default function LandingPage({ onLoginSuccess }: LandingPageProps) {
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'
  const isDesktop = breakpoint === 'desktop'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [cadastroStep, setCadastroStep] = useState<'form' | 'otp' | 'sucesso'>('form')
  const [emailPendente, setEmailPendente] = useState('')
  const [esqueciSenha, setEsqueciSenha] = useState(false)
  const [cadastroDados, setCadastroDados] = useState<CadastroValues>(CADASTRO_INICIAL)
  const [ctaNotice, setCtaNotice] = useState('')

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m)
    setCadastroStep('form')
    setEmailPendente('')
    setEsqueciSenha(false)
    setCadastroDados(CADASTRO_INICIAL)
    setCtaNotice('')
  }

  const handlePricingCta = () => {
    setMode('login')
    setCtaNotice('Você precisa de uma conta para assinar o SmartJuris. Entre ou cadastre-se abaixo.')
    document.getElementById('auth-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await api.auth.login(email, password)

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Credenciais inválidas.')
      }

      onLoginSuccess(data.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-background)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-foreground)'
    }}>
      {/* Top Banner de Destaque */}
      <div style={{
        background: 'var(--color-primary)',
        color: 'var(--color-on-primary)',
        padding: '10px 24px',
        fontSize: FONT.base,
        textAlign: 'center',
        fontWeight: 500,
        letterSpacing: '0.03em',
        lineHeight: 1.5,
        borderBottom: '1px solid color-mix(in srgb, var(--color-on-primary) 10%, transparent)'
      }}>
        ✨ <strong style={{ color: 'var(--color-accent)' }}>SmartJuris v2.5 (LexOS Edition)</strong> — A Primeira Plataforma Jurídica com IA Nativa e Validação Auditável do Brasil.
      </div>

      {/* Navbar Minimalista Swiss */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: isMobile ? '16px 20px' : isTablet ? '18px 32px' : '20px 48px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, minWidth: 0 }}>
          {/* Logo SVG Elegante: Balança da Justiça + Tecnologia IA */}
          <div style={{
            width: 40, height: 40, borderRadius: RADIUS.card,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 12px color-mix(in srgb, var(--color-primary) 15%, transparent)'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3V21" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M5 7H19" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M5 7L2 13C2 14.6569 3.34315 16 5 16C6.65685 16 8 14.6569 8 13L5 7Z" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M19 7L16 13C16 14.6569 17.3431 16 19 16C20.6569 16 22 14.6569 22 13L19 7Z" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="12" cy="7" r="2" fill="var(--color-accent)"/>
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              SmartJuris <span style={{ color: 'var(--color-accent)', fontSize: FONT.lg }}>LexOS</span>
            </div>
            <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2, lineHeight: 1.4 }}>
              Inteligência Jurídica & Gestão Integrada
            </div>
          </div>
        </div>

        {isDesktop && (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xxl, fontSize: FONT.base, fontWeight: 500, color: 'var(--color-muted)' }}>
            <span>RAG BGE-M3 + Qwen</span>
            <span>•</span>
            <span>Supervisão Ética OAB</span>
            <span>•</span>
            <span>Design Swiss Vignelli</span>
          </div>
        )}
      </header>

      {/* Hero Grid Principal */}
      <main style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: isDesktop ? '1fr 440px' : '1fr',
        maxWidth: 1240,
        margin: '0 auto',
        width: '100%',
        padding: isMobile ? '32px 20px' : isTablet ? '40px 32px' : '50px 48px',
        gap: isMobile ? 32 : isTablet ? 40 : 56,
        alignItems: 'center'
      }}>
        {/* Lado Esquerdo: Marca, Posicionamento e Ilustração SVG de Advogados */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--color-badge-tint)', color: 'var(--color-primary)',
            padding: '6px 12px', borderRadius: 20, fontSize: FONT.sm, fontWeight: 600,
            marginBottom: SPACE.xl, border: '1px solid var(--color-border)',
            flexWrap: 'wrap'
          }}>
            <span>⚖️</span> Peticionamento, Contratos e Jurimetria sem Alucinações
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: `clamp(30px, 7.5vw, ${HERO_FONT_SIZE}px)`,
            lineHeight: 1.12,
            letterSpacing: '-0.03em',
            marginBottom: SPACE.xl,
            fontWeight: 400,
            color: 'var(--color-foreground)'
          }}>
            Acelerador Operacional para Advogados e Escritórios de Alta Performance.
          </h1>

          <p style={{
            color: 'var(--color-muted)',
            fontSize: FONT.xl,
            lineHeight: 1.6,
            marginBottom: 32,
            maxWidth: 620
          }}>
            O <strong>SmartJuris LexOS</strong> unifica contencioso, consultivo, financeiro e relacionamento em uma única plataforma com <strong>IA Nativa</strong>. Crie minutas de peças em segundos com RAG vetorial, revise contratos com scanner de risco e acompanhe a linha do tempo do processo e prazos.
          </p>

          {/* Showcase Visual: Foto Real dos Advogados Operando o SmartJuris com IA */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: RADIUS.card,
            overflow: 'hidden',
            marginBottom: 32,
            boxShadow: '0 8px 24px color-mix(in srgb, var(--color-foreground) 6%, transparent)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              position: 'relative',
              width: '100%',
              // Em mobile reduz o tamanho drasticamente conforme o requisito do usuário
              maxHeight: isMobile ? 180 : isTablet ? 260 : 320,
              overflow: 'hidden',
            }}>
              <img
                src={lawyersImg}
                alt="Advogados operando a plataforma jurídica SmartJuris com inteligência artificial"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  filter: 'contrast(1.02) brightness(0.98)',
                }}
                loading="eager"
              />
              <div style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                background: 'rgba(26, 39, 68, 0.85)',
                backdropFilter: 'blur(6px)',
                color: '#ffffff',
                fontSize: FONT.xs,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: RADIUS.chip,
                border: '1px solid rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <span>⚖️</span>
                <span>IA Supervisionada por Advogados</span>
              </div>
            </div>

            <div style={{
              padding: isMobile ? '16px 18px' : '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              background: 'var(--color-surface)',
            }}>
              <div style={{ fontSize: FONT.lg, fontWeight: 700, color: 'var(--color-primary)' }}>
                Blindagem Ética OAB & RAG Vetorial sem Alucinações
              </div>
              <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                1. Extração semântica com BGE-M3 · 2. Raciocínio Qwen · 3. Playbooks de teses · 4. Crivo e validação humana auditável.
              </div>
            </div>
          </div>

          {/* Destaques dos 6 Módulos */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr', gap: SPACE.lg }}>
            {[
              { title: 'Gerador RAG', desc: 'Peças fundamentadas na base do escritório.' },
              { title: 'Painel do Processo', desc: 'Linha do tempo & intimações resumidas por IA.' },
              { title: 'Validação Humana', desc: 'Trilha de auditoria e crivo ético OAB.' },
              { title: 'Jurimetria Preditiva', desc: 'Simulador de probabilidade de êxito.' },
              { title: 'Financeiro & Horas', desc: 'Honorários e gravação de horas faturáveis.' },
              { title: 'Revisão Contratual', desc: 'Scanner autônomo de cláusulas abusivas.' },
            ].map(f => (
              <div key={f.title} style={{ borderLeft: '2px solid var(--color-accent)', paddingLeft: SPACE.md }}>
                <div style={{ fontSize: FONT.base, fontWeight: 600, marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Lado Direito: Formulário de Acesso Stance Swiss */}
        <div
          id="auth-form"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: isMobile ? '24px 20px' : '36px 32px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 30px color-mix(in srgb, var(--color-foreground) 4%, transparent)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: FONT.cardTitle }}>🔐</span>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: FONT.cardTitle,
              letterSpacing: '-0.02em',
              margin: 0
            }}>Acessar o SmartJuris</h2>
          </div>
          <p style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginBottom: SPACE.lg }}>
            {mode === 'login'
              ? 'Digite suas credenciais de advogado ou administrador.'
              : 'Solicite o acesso do seu escritório. A aprovação é feita pelo administrador da plataforma.'}
          </p>

          {/* Aviso de CTA vindo dos planos: visitante precisa de conta para assinar */}
          {ctaNotice && (
            <div style={{
              background: 'var(--color-accent-light)',
              border: '1px solid var(--color-accent)',
              borderRadius: RADIUS.control,
              padding: '12px 14px',
              marginBottom: SPACE.lg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: SPACE.md,
              flexWrap: 'wrap',
              fontSize: FONT.base,
              lineHeight: 1.5,
              color: 'var(--color-foreground)'
            }}>
              <span style={{ fontWeight: 500, flex: 1, minWidth: 200 }}>⚠️ {ctaNotice}</span>
              <button
                type="button"
                onClick={() => { setCtaNotice(''); setMode('signup') }}
                style={{
                  background: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                  border: 'none',
                  borderRadius: RADIUS.chip,
                  padding: '8px 14px',
                  fontSize: FONT.sm,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Criar conta
              </button>
            </div>
          )}

          {/* Toggle Entrar / Criar conta */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            padding: 4,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: RADIUS.control,
            marginBottom: SPACE.xxl,
          }}>
            {(['login', 'signup'] as const).map(m => {
              const active = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  style={{
                    padding: '9px 0',
                    border: 'none',
                    borderRadius: RADIUS.chip,
                    cursor: 'pointer',
                    fontSize: FONT.md,
                    fontWeight: 600,
                    background: active ? 'var(--color-surface)' : 'transparent',
                    color: active ? 'var(--color-primary)' : 'var(--color-muted)',
                    boxShadow: active ? '0 1px 3px color-mix(in srgb, var(--color-foreground) 12%, transparent)' : 'none',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              )
            })}
          </div>

          {mode === 'login' ? (
            esqueciSenha ? (
              <EsqueciSenha onBackToLogin={() => setEsqueciSenha(false)} />
            ) : (
            <>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
                {error && (
                  <div style={{
                    background: 'var(--color-danger-light)',
                    color: 'var(--color-danger)',
                    border: '1px solid var(--color-border)',
                    borderRadius: RADIUS.control,
                    padding: '12px 14px',
                    fontSize: FONT.base,
                    fontWeight: 500
                  }}>
                    ⚠️ {error}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Email Institucional</label>
                  <input
                    type="email"
                    placeholder="admin@smartjuris.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={{ ...inputStyle(!!error), fontFamily: 'var(--font-mono)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Senha de Acesso</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={inputStyle(!!error)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -SPACE.sm }}>
                  <button
                    type="button"
                    onClick={() => setEsqueciSenha(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      fontSize: FONT.sm,
                      fontWeight: 500,
                      color: 'var(--color-primary)',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                  >
                    Esqueci minha senha?
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%', padding: '13px', marginTop: 6 }}
                >
                  {loading ? 'Validando Autenticação...' : 'Entrar no Sistema →'}
                </Button>
              </form>

              {/* Informação do modo demonstração */}
              <div style={{
                marginTop: 28,
                paddingTop: SPACE.xl,
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: FONT.sm,
                lineHeight: 1.6
              }}>
                <span style={{ color: 'var(--color-accent)', flexShrink: 0 }}>🔋</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>Modo demonstração: 10.000 tokens/mês por usuário.</div>
                  <div style={{ color: 'var(--color-muted)' }}>A geração de peças e resumos com IA consome tokens.</div>
                </div>
              </div>
            </>
            )
          ) : cadastroStep === 'otp' ? (
            <CadastroVerificacao
              email={emailPendente}
              onSuccess={() => setCadastroStep('sucesso')}
              onBack={() => setCadastroStep('form')}
            />
          ) : cadastroStep === 'sucesso' ? (
            <CadastroSucesso onBackToLogin={() => switchMode('login')} />
          ) : (
            <CadastroForm
              isMobile={isMobile}
              values={cadastroDados}
              onValuesChange={setCadastroDados}
              onAutoVerified={() => setCadastroStep('sucesso')}
              onCodeSent={(em) => {
                setEmailPendente(em)
                setCadastroStep('otp')
              }}
            />
          )}
        </div>
      </main>

      {/* Seção 1: Mostruário de Produção com Fonte Destacada & Capacidade por Plano */}
      <ProductionShowcase />

      {/* Seção 2: Feedbacks e Prova Social de Advogados pelo Brasil */}
      <TestimonialsSection />

      {/* Seção 3: Planos e Preços Detalhados */}
      <PricingSection onCtaClick={handlePricingCta} />

      {/* Footer Swiss */}
      <footer style={{
        padding: isMobile ? '24px 20px' : isTablet ? '24px 32px' : '24px 48px',
        borderTop: '1px solid var(--color-border)',
        textAlign: 'center',
        fontSize: FONT.sm,
        lineHeight: 1.6,
        color: 'var(--color-muted)',
        background: 'var(--color-surface)'
      }}>
        © {new Date().getFullYear()} SmartJuris LexOS. Inteligência Artificial Jurídica & Gestão para Advocacia Contemporânea. Suporte Técnico via WhatsApp: <a href="https://wa.me/5588993573809" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>88 99357-3809</a>. Estética Vignelli.
      </footer>
    </div>
  )
}
