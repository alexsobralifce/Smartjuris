import { useEffect, type CSSProperties } from 'react'
import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle, FontSize } from '@tiptap/extension-text-style'
import { FONT, RADIUS, SPACE } from '../ui'

interface EditorRicoProps {
  initialContent: any;          // JSON do TipTap (objeto) OU string HTML/plain
  onChange?: (json: any) => void;
  readOnly?: boolean;
  minHeight?: number;
}

/**
 * Converte texto puro em HTML simples (parágrafos + quebras) para o editor.
 * Escapa &, < e >; quebras duplas (parágrafo) viram </p><p>, quebras simples viram <br>.
 */
export function plainToHtml(plain: string): string {
  const escaped = plain
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n\s*\n/)
    .map(chunk => {
      const withBreaks = chunk.replace(/\n/g, '<br>').trim()
      return withBreaks ? `<p>${withBreaks}</p>` : ''
    })
    .join('')
}

const RICO_CSS = `
.editor-rico { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; color: var(--color-foreground); }
.editor-rico p { margin: 0 0 0.6em; }
.editor-rico h1, .editor-rico h2 { font-size: 14pt; font-weight: 700; text-transform: uppercase; margin: 1.2em 0 0.6em; }
.editor-rico h3 { font-size: 13pt; font-weight: 700; margin: 1em 0 0.5em; }
.editor-rico ul { list-style: disc; padding-left: 1.6em; margin: 0 0 0.6em; }
.editor-rico ol { list-style: decimal; padding-left: 1.6em; margin: 0 0 0.6em; }
.editor-rico:focus, .editor-rico .ProseMirror:focus { outline: none; }
`

let ricoStyleInjected = false

export default function EditorRico({ initialContent, onChange, readOnly = false, minHeight = 300 }: EditorRicoProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
        defaultAlignment: 'left',
      }),
      TextStyle,
      FontSize.configure({ types: ['textStyle'] }),
    ],
    content: initialContent,
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
    editorProps: { attributes: { class: 'editor-rico' } },
  })

  // Estado reativo da toolbar (reflete a seleção atual do editor).
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      const align = editor.isActive('heading')
        ? (editor.getAttributes('heading').textAlign as string | undefined)
        : (editor.getAttributes('paragraph').textAlign as string | undefined)
      const fontSize = (editor.getAttributes('textStyle').fontSize as string | undefined) || '12pt'
      return {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        bulletList: editor.isActive('bulletList'),
        orderedList: editor.isActive('orderedList'),
        heading2: editor.isActive('heading', { level: 2 }),
        align: align || 'left',
        fontSize,
      }
    },
  })

  // Injeta o CSS escopado do editor uma única vez.
  useEffect(() => {
    if (ricoStyleInjected) return
    ricoStyleInjected = true
    const styleEl = document.createElement('style')
    styleEl.textContent = RICO_CSS
    document.head.appendChild(styleEl)
  }, [])

  if (!editor) return null

  const toolBtn = (active: boolean): CSSProperties => ({
    padding: '6px 10px',
    borderRadius: RADIUS.control,
    border: '1px solid var(--color-border)',
    background: active ? 'var(--color-primary)' : 'var(--color-surface)',
    color: active ? 'var(--color-on-primary)' : 'var(--color-foreground)',
    fontSize: FONT.base,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    lineHeight: 1,
  })

  const toolSelect: CSSProperties = {
    padding: '5px 6px',
    borderRadius: RADIUS.control,
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    color: 'var(--color-foreground)',
    fontSize: FONT.base,
    outline: 'none',
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
  }

  const divider: CSSProperties = { width: 1, height: 22, background: 'var(--color-border)' }

  return (
    <div>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: RADIUS.control, background: 'var(--color-surface)', padding: SPACE.sm, marginBottom: SPACE.sm }}>
          <button type="button" title="Negrito" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} style={toolBtn(state.bold)}>
            <strong>B</strong>
          </button>
          <button type="button" title="Itálico" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} style={toolBtn(state.italic)}>
            <em>I</em>
          </button>
          <button type="button" title="Sublinhado" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleUnderline().run()} style={toolBtn(state.underline)}>
            <u>U</u>
          </button>

          <span style={divider} />

          <select
            value={state.align}
            onChange={e => editor.chain().focus().setTextAlign(e.target.value).run()}
            style={toolSelect}
            title="Alinhamento"
          >
            <option value="left">Esquerda</option>
            <option value="center">Centralizar</option>
            <option value="right">Direita</option>
            <option value="justify">Justificar</option>
          </select>
          <select
            value={state.fontSize}
            onChange={e => editor.chain().focus().setFontSize(e.target.value).run()}
            style={toolSelect}
            title="Tamanho da fonte"
          >
            {['10pt', '11pt', '12pt', '13pt', '14pt', '16pt', '18pt'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <span style={divider} />

          <button
            type="button"
            title="Parágrafo"
            onMouseDown={e => e.preventDefault()}
            onClick={() => editor.chain().focus().setParagraph().run()}
            style={{ ...toolBtn(false), borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
          >
            ¶
          </button>
          <button type="button" title="Título (nível 2)" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} style={toolBtn(state.heading2)}>
            H2
          </button>
          <button type="button" title="Lista com marcadores" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()} style={toolBtn(state.bulletList)}>
            • Lista
          </button>
          <button type="button" title="Lista numerada" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()} style={toolBtn(state.orderedList)}>
            1. Lista
          </button>
        </div>
      )}

      <div style={{ border: '1px solid var(--color-border)', borderRadius: RADIUS.control, background: 'var(--color-surface)', minHeight, padding: SPACE.md }}>
        <EditorContent editor={editor} style={{ minHeight }} />
      </div>
    </div>
  )
}
