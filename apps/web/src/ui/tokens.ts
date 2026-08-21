// Tokens de design (fonte única para tipografia, espaçamento, raio e z-index).
// Cores vivem em index.css via `--color-*`; estes tokens cobrem as demais escalas.

export const FONT = { xs: 10, sm: 11, base: 12, md: 13, lg: 14, xl: 16, cardTitle: 20, pageTitle: 32 } as const

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, pageY: 32, pageX: 40 } as const

export const RADIUS = { chip: 4, control: 6, card: 8, modal: 10 } as const

export const Z = { sticky: 10, modal: 100, toast: 150 } as const

export const LAYOUT = { pageMaxW: 1150 } as const

