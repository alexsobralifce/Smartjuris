import { useEffect, useMemo, useState } from 'react'
import { FONT, RADIUS } from '../ui'

export interface PaginationProps {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}

export interface PaginationState<T> {
  page: number
  setPage: (page: number) => void
  pageItems: T[]
  pageCount: number
  total: number
  pageSize: number
}

/**
 * Client-side pagination hook. Slices the full `items` array into pages of
 * `pageSize` rows. Resets to page 1 whenever the underlying data length
 * changes (e.g. after a filter narrows the result set).
 */
export function usePagination<T>(items: T[], pageSize = 10): PaginationState<T> {
  const [page, setPage] = useState(1)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  // Reset to the first page when the number of items changes.
  useEffect(() => {
    setPage(1)
  }, [total])

  // Clamp the current page if it falls out of range.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const safePage = Math.min(page, pageCount)

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  return { page: safePage, setPage, pageItems, pageCount, total, pageSize }
}

function getPageList(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }

  const pages: (number | 'gap')[] = [1]
  const left = Math.max(2, page - 1)
  const right = Math.min(pageCount - 1, page + 1)

  if (left > 2) pages.push('gap')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < pageCount - 1) pages.push('gap')
  pages.push(pageCount)

  return pages
}

const btnBase: React.CSSProperties = {
  minWidth: 30,
  height: 30,
  padding: '0 8px',
  borderRadius: RADIUS.control,
  border: '1px solid var(--color-border)',
  background: 'transparent',
  color: 'var(--color-muted)',
  fontSize: FONT.base,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export default function Pagination({ page, pageCount, total, pageSize, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const pages = getPageList(page, pageCount)

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
      padding: '12px 18px',
      borderTop: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
    }}>
      <div style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>
        Mostrando {start}–{end} de {total}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          aria-label="Página anterior"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={{ ...btnBase, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} style={{ fontSize: FONT.base, color: 'var(--color-muted)', padding: '0 2px' }}>…</span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={`Página ${p}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPageChange(p)}
              style={{
                ...btnBase,
                background: p === page ? 'var(--color-primary)' : 'transparent',
                color: p === page ? 'var(--color-on-primary)' : 'var(--color-muted)',
                borderColor: p === page ? 'var(--color-primary)' : 'var(--color-border)',
                fontWeight: p === page ? 600 : 500,
              }}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          aria-label="Próxima página"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          style={{ ...btnBase, opacity: page >= pageCount ? 0.4 : 1, cursor: page >= pageCount ? 'not-allowed' : 'pointer' }}
        >
          ›
        </button>
      </div>
    </div>
  )
}
