# SKIN DE TESTES — Stack JavaScript/TypeScript (Next.js + React + Node.js)
### Perfil profissional de testes para sistemas full-stack modernos (2026)

---

## 1. Filosofia de teste adotada: Testing Trophy (não a Pyramid clássica)

Para aplicações frontend e full-stack JS, o modelo proposto por Kent C. Dodds — o **Testing Trophy** — supera a Pyramid tradicional porque componentes React misturam lógica e interação de usuário, tornando "unit puro" artificial e frágil.

| Camada          | Proporção alvo       | Ferramenta principal        | Foco                                      |
|-----------------|-----------------------|-------------------------------|---------------------------------------------|
| Static Analysis | Base (sempre ativo)  | TypeScript, ESLint, Prettier  | Erros antes mesmo de rodar teste            |
| Unit            | ~20%                  | Vitest                        | Funções puras, regras de negócio            |
| Integration     | ~60% (maior camada)  | Vitest + RTL + MSW            | Componentes com estado real, API routes     |
| E2E             | ~10-20%               | Playwright                    | Jornadas críticas do usuário                |

> Diferente do backend puro (pirâmide 70/20/10), aqui a **integração é a camada dominante**, pois é onde React realmente entrega valor testável — testar cada função isoladamente com tudo mockado produz falsos positivos.

---

## 2. Stack de ferramentas por camada

| Necessidade                            | Ferramenta                        | Substitui                    |
|------------------------------------------|--------------------------------------|---------------------------------|
| Test runner unit/integration             | **Vitest**                          | Jest (mais rápido, ESM nativo) |
| Renderização e queries de componentes    | **React Testing Library (RTL)**     | Enzyme (obsoleto)               |
| Simulação de interação real              | **@testing-library/user-event**     | fireEvent                       |
| Mock de rede (API)                       | **MSW (Mock Service Worker)**       | jest.mock em fetch              |
| Testes E2E cross-browser                 | **Playwright**                      | Cypress/Selenium                |
| Testes de API/Node isolado               | **Supertest**                       | requests manuais                |
| Componentes isolados + visual            | **Storybook + @storybook/test**     | —                                |
| Acessibilidade                           | **jest-axe / axe-playwright**       | —                                |
| Cobertura                                | **@vitest/coverage-v8**             | Istanbul                        |

Instalação básica:

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event
pnpm add -D @vitejs/plugin-react jsdom msw
pnpm add -D playwright @playwright/test supertest
```

---

## 3. Configuração base (vitest.config.ts)

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/app/**/layout.tsx'],
      thresholds: { statements: 80, branches: 75, functions: 80, lines: 80 },
    },
    pool: 'forks',
    poolOptions: { forks: { maxForks: 4 } },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './src/mocks/server';

afterEach(() => cleanup());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## 4. SKIN A — Unit + Component Testing (camada rápida)

Foco: lógica de negócio pura e componentes de UI isolados. Objetivo: execução em milissegundos, sem rede, sem browser real.

### 4.1 Unit test de função pura

```ts
// pricing.ts
export function calculateDiscount(subtotal: number, tier: 'free' | 'pro' | 'enterprise'): number {
  if (subtotal <= 0) return 0;
  const rates = { free: 0, pro: 0.10, enterprise: 0.20 };
  return Math.round(subtotal * rates[tier] * 100) / 100;
}

// pricing.test.ts
import { describe, it, expect } from 'vitest';
import { calculateDiscount } from './pricing';

describe('calculateDiscount', () => {
  it.each([
    [100, 'free', 0],
    [100, 'pro', 10],
    [250, 'enterprise', 50],
    [0, 'enterprise', 0],
    [-50, 'pro', 0],
  ])('subtotal=%i tier=%s -> %i', (subtotal, tier, expected) => {
    expect(calculateDiscount(subtotal, tier as any)).toBe(expected);
  });
});
```

### 4.2 Component test (RTL) — comportamento do usuário, não implementação

```tsx
// search-bar.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SearchBar } from './search-bar';

describe('SearchBar', () => {
  it('chama onSearch com valor sanitizado ao enviar', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);

    await user.type(screen.getByRole('textbox', { name: /search/i }), ' playwright ');
    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(onSearch).toHaveBeenCalledWith('playwright');
  });

  it('não chama onSearch com campo vazio', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    await user.click(screen.getByRole('button', { name: /search/i }));
    expect(onSearch).not.toHaveBeenCalled();
  });
});
```

### 4.3 Custom hook

```ts
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { useDebounce } from './use-debounce';

describe('useDebounce', () => {
  it('atualiza valor após o delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 500 } }
    );
    rerender({ value: 'b', delay: 500 });
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('b');
    vi.useRealTimers();
  });
});
```

**Regras da SKIN A:**

- Query sempre por `role`/`label`/`text`, nunca por classe CSS ou `data-testid` como primeira opção.
- Use `userEvent`, nunca `fireEvent` (simula digitação/foco/tab reais e captura bugs que `fireEvent` ignora).
- Nunca teste implementação interna (estado privado, nomes de métodos).
- Snapshot testing apenas para componentes visuais estáticos (ex.: `Badge`), com moderação — não abusar.

---

## 5. SKIN B — Integration Testing (API routes, Server Actions, MSW)

Foco: contratos reais entre camadas — rota + banco mockado, componente + fetch real interceptado, Server Actions do Next.js. Esta é a camada de maior volume no Testing Trophy.

### 5.1 API Route Handler (Next.js App Router)

```ts
// app/api/skills/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue([{ id: '1', name: 'X' }]),
  },
}));

describe('GET /api/skills', () => {
  it('retorna resultados paginados', async () => {
    const req = new NextRequest('http://localhost/api/skills?page=1&limit=10');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.skills).toHaveLength(1);
  });
});
```

### 5.2 Server Action

```ts
// publish-skill.test.ts
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@clerk/nextjs/server';
import { publishSkill } from './publish-skill';

describe('publishSkill', () => {
  it('rejeita sem autenticação', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);
    const result = await publishSkill(new FormData());
    expect(result).toEqual({ error: 'Authentication required' });
  });
});
```

### 5.3 Componente com fetch real interceptado via MSW

```ts
// mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/skills', () =>
    HttpResponse.json({ skills: [{ id: '1', name: 'Playwright E2E' }] })
  ),
];
```

```tsx
// skills-list.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { SkillsList } from './skills-list';

it('mostra erro amigável em falha de API', async () => {
  server.use(http.get('/api/skills', () => HttpResponse.json({ error: 'fail' }, { status: 500 })));
  render(<SkillsList />);
  await waitFor(() => expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument());
});
```

### 5.4 Testando Node.js/Express com Supertest

```ts
import request from 'supertest';
import { app } from '../app';

describe('POST /api/users', () => {
  it('cria usuário válido', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Ana', email: 'ana@test.com' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Ana' });
  });

  it('rejeita email inválido', async () => {
    const res = await request(app).post('/api/users').send({ name: 'Ana', email: 'invalido' });
    expect(res.status).toBe(400);
  });
});
```

**Regras da SKIN B:**

- Mock no **limite de rede** (MSW), não no `fetch` direto — isso exercita mais código real do caminho de dados.
- React Server Components: teste a camada de dados (funções `async`, sem hooks) separada da apresentação (componente client recebendo props).
- Sempre cobrir: caminho feliz, erro de validação (400), erro de servidor (500), não autenticado (401).

---

## 6. SKIN C — E2E Testing com Playwright (jornadas críticas)

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: { command: 'pnpm next dev', port: 3000, reuseExistingServer: !process.env.CI },
});
```

```ts
// e2e/checkout.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Checkout', () => {
  test('completa compra com usuário autenticado', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Senha').fill('senha123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await page.goto('/produtos/plano-pro');
    await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
    await page.getByRole('link', { name: 'Carrinho' }).click();
    await page.getByRole('button', { name: 'Finalizar compra' }).click();

    await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  });
});
```

Autenticação reutilizável via `storageState` (evita repetir login em cada teste):

```ts
// e2e/auth.setup.ts
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel('Senha').fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('/dashboard');
  await page.context().storageState({ path: '.auth/user.json' });
});
```

**Regras da SKIN C:**

- Máximo 10-30 testes E2E totais — apenas jornadas que geram receita ou risco (login, checkout, onboarding, pagamento).
- Suite completa deve rodar em menos de 30 minutos; use sharding do Playwright (`--shard=1/4`) se necessário.
- Nunca testar edge cases de lógica via UI — isso pertence à SKIN A/B.

---

## 7. Pipeline CI/CD (GitHub Actions)

```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  unit-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage

  e2e:
    runs-on: ubuntu-latest
    needs: unit-integration
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test --project=chromium
```

Mapeamento de gatilho:

| Trigger               | O que roda                  | Meta de tempo |
|-------------------------|-------------------------------|-----------------|
| Todo push               | Unit + lint                  | < 3 min          |
| Abertura/update de PR   | Unit + integration            | < 10 min         |
| Merge para main         | Unit + integration + E2E      | < 20 min         |
| Pós-deploy              | Smoke E2E (3-5 fluxos)         | < 5 min          |

---

## 8. Checklist de qualidade (aplicar em toda PR)

- Cobertura mínima: statements 80%, branches 75%, módulos críticos (auth/pagamento) 90%+.
- Nenhum teste depende da ordem de execução (validar com `vitest --sequence.shuffle`).
- Acessibilidade verificada com `jest-axe` em componentes de formulário e navegação.
- `data-testid` nunca como primeira escolha de seletor — priorizar `role`/`label`/`text`.
- Testes tratados como código de produção: sem duplicação, com fixtures e helpers reutilizáveis, revisados em code review.
