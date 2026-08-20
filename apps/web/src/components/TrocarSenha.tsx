import { useState } from 'react'
import { api } from '../api/client'
import Toast, { ToastMessage } from './Toast'

interface TrocarSenhaProps {
  user: { name: string; email: string; role: string; [key: string]: any }
  onSuccess: (newUser: any) => void
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  display: 'block',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-background)',
  fontSize: 13,
  color: 'var(--color-foreground)',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
}

const fieldErrorStyle: React.CSSProperties = {
  color: 'var(--color-danger)',
  fontSize: 11,
  marginTop: 6,
}

export default function TrocarSenha({ user, onSuccess }: TrocarSenhaProps) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [errors, setErrors] = useState<{ senhaAtual?: string; novaSenha?: string; confirmar?: string }>({})
  const [loading, setLoading] = useState(false)

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = String(Date.now())
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const validate = () => {
    const next: typeof errors = {}
    if (!senhaAtual.trim()) next.senhaAtual = 'Informe sua senha atual.'
    if (novaSenha.length < 8) next.novaSenha = 'A nova senha deve ter no mínimo 8 caracteres.'
    if (!confirmar) next.confirmar = 'Confirme a nova senha.'
    else if (confirmar !== novaSenha) next.confirmar = 'As senhas não coincidem.'
    return next
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      // Fase 7 implementará o endpoint — shape esperado:
      // POST /api/auth/trocar-senha { senhaAtual, novaSenha } → { user }
      const res = await api.auth.trocarSenha(senhaAtual, novaSenha)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = data?.code
        if (code === 'PASSWORD_CHANGE_REQUIRED' || res.status === 403 || res.status === 401) {
          addToast('error', data?.error || 'Senha atual incorreta. Verifique e tente novamente.')
        } else {
          addToast('error', data?.error || 'Não foi possível atualizar a senha.')
        }
        return
      }
      addToast('success', 'Senha atualizada com sucesso')
      onSuccess(data?.user ?? { ...user, precisaTrocarSenha: false })
    } catch {
      addToast('error', 'Não foi possível atualizar a senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const firstName = (user?.name || 'Advogado').split(' ')[0]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(1200px 600px at 50% -10%, rgba(200,168,75,0.10), transparent 60%), var(--color-background)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-foreground)',
    }}>
      {/* Barra superior da marca */}
      <div style={{
        background: 'var(--color-primary)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#18170f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', color: '#fff', fontSize: 15, letterSpacing: '-0.02em' }}>
            SmartJuris <span style={{ color: 'var(--color-accent)', fontSize: 12 }}>LexOS</span>
          </span>
        </div>
      </div>

      {/* Card centralizado */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '40px 40px 36px',
          boxShadow: '0 20px 60px rgba(24,23,15,0.06)',
        }}>
          {/* Ícone de segurança */}
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--color-badge-tint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-primary)',
            marginBottom: 18,
          }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            letterSpacing: '-0.02em',
            margin: '0 0 8px',
            fontWeight: 400,
            lineHeight: 1.15,
          }}>
            Bem-vindo — defina sua nova senha
          </h1>

          <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: '0 0 6px', lineHeight: 1.55 }}>
            Olá, <strong style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{firstName}</strong>. Por segurança, crie uma nova senha antes de acessar o sistema.
          </p>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', marginBottom: 26 }}>
            {user?.email}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Senha atual</label>
              <input
                type="password"
                value={senhaAtual}
                onChange={e => {
                  setSenhaAtual(e.target.value)
                  if (errors.senhaAtual) setErrors(p => ({ ...p, senhaAtual: undefined }))
                }}
                placeholder="••••••••"
                autoComplete="current-password"
                autoFocus
                style={{ ...inputStyle, borderColor: errors.senhaAtual ? 'var(--color-danger)' : 'var(--color-border)' }}
              />
              {errors.senhaAtual && <div style={fieldErrorStyle}>{errors.senhaAtual}</div>}
            </div>

            <div>
              <label style={labelStyle}>Nova senha</label>
              <input
                type="password"
                value={novaSenha}
                onChange={e => {
                  setNovaSenha(e.target.value)
                  if (errors.novaSenha) setErrors(p => ({ ...p, novaSenha: undefined }))
                }}
                placeholder="Mínimo de 8 caracteres"
                autoComplete="new-password"
                style={{ ...inputStyle, borderColor: errors.novaSenha ? 'var(--color-danger)' : 'var(--color-border)' }}
              />
              {errors.novaSenha && <div style={fieldErrorStyle}>{errors.novaSenha}</div>}
            </div>

            <div>
              <label style={labelStyle}>Confirmar nova senha</label>
              <input
                type="password"
                value={confirmar}
                onChange={e => {
                  setConfirmar(e.target.value)
                  if (errors.confirmar) setErrors(p => ({ ...p, confirmar: undefined }))
                }}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                style={{ ...inputStyle, borderColor: errors.confirmar ? 'var(--color-danger)' : 'var(--color-border)' }}
              />
              {errors.confirmar && <div style={fieldErrorStyle}>{errors.confirmar}</div>}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '13px',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 6,
                opacity: loading ? 0.75 : 1,
                transition: 'background 0.2s',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--color-primary-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-primary)' }}
            >
              {loading ? 'Atualizando senha…' : 'Salvar nova senha'}
            </button>
          </form>

          <div style={{
            marginTop: 22,
            paddingTop: 16,
            borderTop: '1px solid var(--color-border)',
            fontSize: 11,
            color: 'var(--color-muted)',
            lineHeight: 1.55,
          }}>
            🔒 Use uma combinação forte — letras, números e símbolos. Sua nova senha deve ter no mínimo 8 caracteres.
          </div>
        </div>
      </div>

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
