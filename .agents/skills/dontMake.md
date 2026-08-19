---
name: frontend-ux-adaptive-guardian
description: >
  Garante consistência de UI/UX seguindo "Don't Make Me Think" (Steve Krug),
  com abordagem mobile-first como ponto de partida, mas totalmente adaptável 
  a tablet, desktop e telas grandes, sem duplicar lógica de design.
---

# Frontend UX Adaptive Guardian

## Filosofia adaptativa
- Mobile first é o PONTO DE PARTIDA, não a única entrega.
- Cada breakpoint deve aproveitar o espaço disponível, não apenas "esticar" o layout mobile.
- Densidade de informação aumenta progressivamente: mobile (essencial) > tablet (essencial + secundário) > desktop (essencial + secundário + terciário).
- Nunca remover funcionalidade em telas maiores — apenas simplificar em telas menores.

## Breakpoints
- mobile: até 640px
- tablet: 641px a 1024px
- desktop: 1025px a 1440px
- wide_screen: acima de 1440px

## Regras por dispositivo

### Mobile
- Ícones puros em ações secundárias (editar, excluir, compartilhar).
- Navegação em bottom bar ou hambúrguer menu.
- Touch targets mínimos de 44x44px.
- Uma coluna, conteúdo essencial na primeira dobra.
- Modais/drawers full-screen em vez de popups pequenos.

### Tablet
- Ícones podem receber texto complementar em ações críticas.
- Layout híbrido: sidebar colapsável + conteúdo em 1-2 colunas.
- Aproveitar espaço extra para mostrar dados antes ocultos.
- Touch e mouse coexistem — manter área de toque generosa.

### Desktop
- Ícone + texto visível como padrão em toolbars e botões de ação.
- Sidebar fixa, múltiplas colunas, tooltips ativados por hover.
- Aproveitar espaço para exibir dados secundários.
- Atalhos de teclado disponíveis e sinalizados.

### Wide screen
- Nunca esticar conteúdo até a borda — usar max-width e centralizar.
- Aproveitar espaço lateral para painéis auxiliares.

## Regra de ícones vs texto
- Espaço restrito (mobile, componentes compactos) → ícone puro + aria-label.
- Espaço confortável (tablet+) → ícone + texto quando a ação for ambígua.
- Ação primária/CTA → texto sempre visível, em qualquer dispositivo.
- Ícones sempre de biblioteca padrão (Lucide), nunca customizados sem necessidade real.

## Hierarquia e consistência
- Componentes construídos como "sistema único responsivo".
- Usar tokens de design (spacing, cores, tipografia) compartilhados.
- Mesma nomenclatura de componentes em todo o design system.
- Testar sempre: hover (desktop), touch (mobile/tablet), foco via teclado.

## Acessibilidade
- Contraste mínimo AA (WCAG) em qualquer resolução.
- Aria-labels obrigatórios em ícones sem texto visível.
- Navegação por teclado funcional em desktop; foco visível sempre.

## Validação contínua
- Antes de finalizar: "essa interface funciona bem em mobile E aproveita bem o espaço em desktop, sem parecer duas experiências diferentes?"
- Sugerir teste com 3-5 usuários reais em pelo menos 2 tamanhos de tela.

## Padrão de formulários (regra do projeto)
- Máximo 2 colunas em formulários. Campos agrupados por pares lógicos.
- Mobile: 1 coluna sempre.
- Tablet+: 2 colunas (md:grid-cols-2).
- Tabelas e grids de dados não são formulários — podem ter N colunas.
