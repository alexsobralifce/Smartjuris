import { seed } from './seed'
import type { DB, Processo, Peca, Documento } from './types'

const KEY = 'lexia_db'

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DB
  } catch {}
  // First run: persist seed
  save(seed)
  return structuredClone(seed)
}

function save(db: DB): void {
  localStorage.setItem(KEY, JSON.stringify(db))
}

function get(): DB {
  return load()
}

// ── Processos ──────────────────────────────────────────────

export function getProcessos(): Processo[] {
  return get().processos
}

export function addProcesso(p: Processo): void {
  const db = get()
  db.processos.unshift(p)
  save(db)
}

export function updateProcesso(id: string, patch: Partial<Processo>): void {
  const db = get()
  const i = db.processos.findIndex(p => p.id === id)
  if (i !== -1) db.processos[i] = { ...db.processos[i], ...patch }
  save(db)
}

export function deleteProcesso(id: string): void {
  const db = get()
  db.processos = db.processos.filter(p => p.id !== id)
  save(db)
}

// ── Peças ──────────────────────────────────────────────────

export function getPecas(): Peca[] {
  return get().pecas
}

export function addPeca(p: Peca): void {
  const db = get()
  db.pecas.unshift(p)
  save(db)
}

export function updatePeca(id: string, patch: Partial<Peca>): void {
  const db = get()
  const i = db.pecas.findIndex(p => p.id === id)
  if (i !== -1) db.pecas[i] = { ...db.pecas[i], ...patch }
  save(db)
}

// ── Documentos ─────────────────────────────────────────────

export function getDocumentos(): Documento[] {
  return get().documentos
}

export function addDocumento(d: Documento): void {
  const db = get()
  db.documentos.unshift(d)
  save(db)
}

// ── Dev util ───────────────────────────────────────────────

export function resetDB(): void {
  save(structuredClone(seed))
}

export function exportDB(): string {
  return JSON.stringify(get(), null, 2)
}
