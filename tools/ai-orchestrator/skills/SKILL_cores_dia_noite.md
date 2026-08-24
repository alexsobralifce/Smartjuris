---
name: theming-light-dark-css
description: Implements robust, responsive light/dark ("dia e noite") theming in CSS for web and mobile (Next.js, React Native Web, PWA) applications using design tokens, the native light-dark() function with @media/@container fallbacks, and OS-sync + manual-override patterns. Use when the user mentions dark mode, light mode, tema claro/escuro, prefers-color-scheme, color-scheme, theme toggling, CSS variables for themes, or reports bugs like flashing themes (FOUC), inconsistent colors across breakpoints, or mobile WebView theme mismatches.
---

# Theming Light/Dark (CSS Responsivo Web + Mobile)

## Visão geral

Erros comuns em "modo dia/noite" vêm de **misturar estratégias** (media query + classe JS + inline style) sem uma única fonte de verdade. Esta skill impõe uma arquitetura fixa: **design tokens semânticos** → **color-scheme + light-dark()** → **override manual via atributo, não classe** → **sincronização com localStorage sem FOUC**.

Trate isso como uma ponte estreita (baixa liberdade): siga a ordem exata abaixo. Não invente variações a menos que o projeto já tenha um design system incompatível — nesse caso, adapte apenas a camada de tokens, mantendo o mecanismo de resolução.

## Regra de ouro: uma única fonte de verdade

Nunca combine `@media (prefers-color-scheme)` com toggle de classe `.dark` no mesmo projeto sem um adaptador central. Escolha **um** mecanismo de resolução de tema e todos os componentes leem dele — nunca hardcode cor condicional dentro de componente individual.

## Passo 1: Definir tokens semânticos, nunca cores cruas

Nunca use `color-dark`, `bg-black` etc. em componentes. Defina tokens por **função**, não por valor:

```css
:root {
  color-scheme: light dark; /* habilita light-dark() e UI nativa do browser (scrollbar, inputs) */

  --color-bg-surface: light-dark(#ffffff, #121212);
  --color-bg-elevated: light-dark(#f5f5f7, #1e1e1e);
  --color-text-primary: light-dark(#1a1a1a, #f2f2f2);
  --color-text-secondary: light-dark(#5c5c5c, #a3a3a3);
  --color-border: light-dark(#e0e0e0, #333333);
  --color-accent: light-dark(#0066ff, #4d94ff);
}
```

Regras:
- Todo componente consome `var(--color-*)`, nunca `light-dark()` diretamente inline espalhado pelo CSS — centralize em `:root`.
- Nomeie por papel (`surface`, `elevated`, `border`, `accent`), não por tom (`gray-100`), para evitar ambiguidade quando o valor mudar de esquema.
- Se precisar de mais de ~15 tokens, separe em `tokens/colors.css` e importe — não deixe a lista crescer dentro do componente.

## Passo 2: Resolver o esquema (auto + override manual)

`light-dark()` sozinho só segue o SO. Para permitir toggle manual sem quebrar o auto-detect, controle `color-scheme` no elemento raiz via atributo `data-theme`, não classe CSS:

```css
:root {
  color-scheme: light dark; /* padrão: segue o SO */
}
:root[data-theme='light'] {
  color-scheme: light; /* força claro */
}
:root[data-theme='dark'] {
  color-scheme: dark; /* força escuro */
}
```

```js
// Aplicar ANTES do primeiro paint para evitar flash (FOUC)
const saved = localStorage.getItem('theme'); // 'light' | 'dark' | null
if (saved) document.documentElement.setAttribute('data-theme', saved);
```

Regra crítica: esse script de aplicação inicial deve rodar **inline no `<head>`, síncrono, antes de qualquer CSS de layout pesado** — não em `useEffect` do React, pois isso causa flash visível. Em Next.js, use um `<script>` inline no `_document.tsx` ou `app/layout.tsx` (não `next/script`).

## Passo 3: Fallback para browsers sem light-dark() (Safari <17.5, mobile WebViews antigos)

Sempre inclua fallback via `@supports`, pois WebViews de apps mobile (React Native WebView, apps híbridos) frequentemente atrasam suporte a features novas:

```css
@supports not (color: light-dark(#000, #fff)) {
  :root {
    --color-bg-surface: #ffffff;
    --color-text-primary: #1a1a1a;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      --color-bg-surface: #121212;
      --color-text-primary: #f2f2f2;
    }
  }
  :root[data-theme='dark'] {
    --color-bg-surface: #121212;
    --color-text-primary: #f2f2f2;
  }
}
```

Nunca omita este bloco em apps que rodam dentro de WebView mobile (React Native, Capacitor, Cordova) — é a causa mais comum de "funciona no Chrome mas não no app".

## Passo 4: Responsividade não deve reintroduzir hardcode

Media queries de layout (`@media (max-width: ...)`) e de tema (`prefers-color-scheme`) são ortogonais — nunca duplique cores dentro de breakpoints:

```css
/* ERRADO: duplica lógica de tema dentro de breakpoint */
@media (max-width: 768px) {
  .card { background: #1e1e1e; }
}

/* CORRETO: breakpoint só ajusta layout, cor vem do token */
@media (max-width: 768px) {
  .card { padding: 12px; }
}
.card { background: var(--color-bg-elevated); }
```

Se a densidade de cor precisa variar por tamanho de tela (raro), crie um token adicional (`--color-bg-elevated-compact`) em vez de sobrescrever a cor dentro do media query de layout.

## Passo 5: Mobile nativo (React Native / Flutter) — mesma árvore de tokens

Para apps mobile nativos que não usam CSS, replique a mesma estrutura semântica (não `light-dark()`, que é exclusivo de CSS):

```js
// theme.js — mesma nomenclatura de tokens do CSS, valores espelhados
export const lightTheme = { bgSurface: '#ffffff', textPrimary: '#1a1a1a' };
export const darkTheme  = { bgSurface: '#121212', textPrimary: '#f2f2f2' };
```

Use `useColorScheme()` (RN) ou `MediaQuery.platformBrightnessOf(context)` (Flutter) como equivalente de `prefers-color-scheme`, com o mesmo padrão de override manual persistido (AsyncStorage/SharedPreferences) em vez de localStorage.

## Checklist de verificação (rode antes de considerar concluído)

```
- [ ] color-scheme: light dark definido em :root
- [ ] Todas as cores usam var(--color-*), zero hex/rgb hardcoded em componentes
- [ ] Override manual via [data-theme], não via classe .dark isolada
- [ ] Script de aplicação do tema salvo é inline e síncrono no <head> (sem FOUC)
- [ ] Bloco @supports not (color: light-dark(...)) presente para fallback
- [ ] Nenhum @media (max-width) contém declaração de cor
- [ ] Testado em: Chrome desktop, Safari iOS, WebView do app mobile (se aplicável)
- [ ] Contraste verificado em ambos os esquemas (WCAG AA mínimo 4.5:1 para texto)
```

## Erros a nunca cometer (red flags)

- Usar `!important` para forçar tema — sinal de que a cascata de tokens está errada.
- Misturar `prefers-color-scheme` em media query E `light-dark()` para o mesmo token — escolha um.
- Aplicar tema salvo em `useEffect`/`componentDidMount` — sempre causa flash.
- Duplicar paleta de cores em JS (styled-components theme) E em CSS vars sem sincronizar — vira fonte dupla de verdade.
- Testar só no desktop e assumir que funciona no WebView mobile.
