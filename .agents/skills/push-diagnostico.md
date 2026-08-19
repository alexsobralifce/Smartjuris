---
name: push-diagnostics-end-to-end
description: Diagnóstico completo do pipeline de Web Push (VAPID → build → browser → API → worker → push service → device). Use quando push notifications não chegam ao dispositivo do usuário, ao depurar o sistema de notificações, ou ao verificar a integridade do pipeline push.
---

# Diagnóstico de Web Push (End-to-End)

## Visão geral

O pipeline de push do GymApp tem 7 camadas. Se notificações não chegam, o problema está em **uma** delas. Diagnostique em ordem, da esquerda pra direita — cada camada depende da anterior.

```
[1] Env Vars   →   [2] Build Vite   →   [3] Browser Permission   →   [4] Subscription   →   [5] API/DB   →   [6] Worker/Queue   →   [7] Push Service   →   📱 Device
   Railway API       Railway Web          Notification API              pushManager          PATCH /auth/me     BullMQ + worker     FCM / APNs Web       navegador/PWA
```

**Regra de ouro:** nunca pule camadas. Se a camada N está quebrada, as camadas N+1 em diante são irrelevantes.

---

## Camada 1 — Variáveis de Ambiente (Railway — API)

**O que verificar:** Serviço **API** no Railway → aba **Variables**

| Variável | Obrigatória | Como verificar |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Sim | Deve ter ~87 caracteres base64 |
| `VAPID_PRIVATE_KEY` | Sim | Deve ter ~43 caracteres base64 |
| `VAPID_SUBJECT` | Sim | Deve começar com `mailto:` |

**Endpoint de verificação:** `GET /health` → `checks.vapid.configured === true`

**Log no startup:** Procure por `[WebPush] VAPID configurado: true` nos logs do Railway.

**Sintoma se ausente:** Backend nunca tenta enviar push. `sendWebPush()` retorna `'failed'` silenciosamente. Log mostra `[WebPush] Chaves VAPID não configuradas. Pulando envio de push.`

**Como gerar as chaves:**
```bash
npx web-push generate-vapid-keys
```
Copie `Public Key` → `VAPID_PUBLIC_KEY`, `Private Key` → `VAPID_PRIVATE_KEY`.

---

## Camada 2 — Build do Frontend (Railway — Web)

**O que verificar:** Serviço **Web** no Railway → aba **Variables**

| Variável | Obrigatória | Valor esperado |
|---|---|---|
| `VITE_VAPID_PUBLIC_KEY` | Sim | **Mesma** chave pública da Camada 1 |

**⚠️ Essa variável é injetada no build time pelo Vite (`import.meta.env`).** Se foi adicionada após o último deploy, **é necessário redeploy** do serviço Web.

**Verificação no browser:** Abra o console do navegador na aplicação. O `DebugOverlay` (ícone 🐛 no menu) mostra `VAPID no build: sim` no painel de Push.

**Verificação manual no console:**
```js
// Se undefined → VITE_VAPID_PUBLIC_KEY não está no build
fetch('/assets/index-*.js').then(r => r.text()).then(t => t.includes('BBYvxh'))
```

**Sintoma se ausente:** `subscribeAndSave()` em `useNotifications.ts` faz early return com log `VITE_VAPID_PUBLIC_KEY não configurada no build — sem push web`. Nenhuma subscription é criada.

---

## Camada 3 — Permissão do Navegador

**O que verificar:** `Notification.permission` no browser

| Estado | Significado | O que fazer |
|---|---|---|
| `default` | Nunca decidiu | Mostrar `NotificationPrompt` — usuário precisa clicar "Ativar" |
| `granted` | Concedida | ✅ Prosseguir |
| `denied` | Bloqueada | Usuário precisa reativar em Configurações do Site no Chrome/Safari |

**Verificação:** `DebugOverlay` → painel Push → `Permission: granted | denied | default`

**Fluxo normal:**
1. `App.tsx` renderiza `<NotificationPrompt />` quando usuário está logado
2. Se permissão é `default`, após 3 segundos aparece o card "Receba notificações"
3. Usuário clica "Ativar" → `activatePush()` → `Notification.requestPermission()`
4. Se `granted` → `subscribeAndSave()` é chamada automaticamente

**Se permissão já era `granted`:** O hook `useNotifications` (em `App.tsx` onde o `DebugOverlay` é montado) chama `subscribeAndSave()` no mount para renovar a subscription.

**Sintoma se ausente:** Nenhuma subscription. `DebugOverlay` mostra `Subscription: nenhuma`.

---

## Camada 4 — Subscription do PushManager

**O que verificar:** `pushManager.getSubscription()` no service worker

**Código relevante:** `apps/web/src/hooks/useNotifications.ts` — função `subscribeAndSave()`

```ts
const registration = await navigator.serviceWorker.ready
let subscription = await registration.pushManager.getSubscription()
if (!subscription) {
  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublic),  // ← VITE_VAPID_PUBLIC_KEY
  })
}
```

**Verificação:** `DebugOverlay` → painel Push:
- `Service Worker: registrado` → ✅ SW ativo
- `Subscription: ativa` → ✅ Subscription criada
- `SW scope: /` → ✅ Escopo correto

**Também mostra o endpoint completo** — útil para verificar no backend.

**Possíveis falhas:**
- `applicationServerKey` inválida → erro no console
- Service Worker não registrado → verificar `sw.js` em `public/`
- Navegador não suporta Push API → Safari desktop antigo, Firefox em modo privado

---

## Camada 5 — Salvamento na API (PATCH /auth/me)

**O que verificar:** A subscription foi enviada ao backend e salva no banco

**Código relevante:**
- `subscribeAndSave()` → `updatePushSubscription(subscription.toJSON())`
- Auth store (`apps/web/src/stores/auth.ts:130`) → `api.updateMe({ webPushSubscription: subscription })`
- API (`apps/api/src/presentation/http/routes/auth.routes.ts:158-175`) → salva em `usuarios.web_push_subscription`

**Verificação no backend:**
```sql
SELECT id, email, web_push_subscription IS NOT NULL as has_push_sub
FROM usuarios
WHERE web_push_subscription IS NOT NULL;
```

**Logs:** No console do navegador (via `debugLog`): `[Push] Subscription web salva no servidor`. No backend: `[Auth] Salvando subscription web para usuario <id>`.

**⚠️ Falha silenciosa:** Se `PATCH /auth/me` falhar, o erro é capturado com `catch {}` vazio — a subscription é perdida. Verifique os logs de rede no DevTools.

---

## Camada 6 — Worker/Queue (BullMQ)

**O que verificar:** Os workers que disparam push estão funcionando

**Workers relevantes:**

| Worker | Fila | Quando dispara |
|---|---|---|
| `inatividade-30min` | `inatividade-30min` | Treino ocioso 10min, treino longo 60min, parado 30min |
| `social-notify` | `social-notify` | Amigo inicia/conclui treino, recorde, badge |
| `mensagem-motivacional` | `mensagem-motivacional` | Mensagens científicas agendadas |

**Código relevante:**
- `apps/api/src/application/workers/gymWorkers.ts:65-88` — worker de inatividade lê `web_push_subscription` do aluno
- `apps/api/src/jobs/social/notify-friends.worker.ts:32-36` — worker social lê `web_push_subscription` dos amigos
- `apps/api/src/infrastructure/push/sendDualPush.ts` — função que decide Expo vs Web push

**Verificação:** `GET /health` → `checks.workers.social.available === true`

**Log do worker no Railway:** Procure por `[Push] Dual: expo_token=... web_sub=...`. Se `web_sub=false`, o usuário não tem subscription salva (volte para Camada 5).

**Possíveis falhas:**
- Redis offline → workers não iniciam → `GET /health` mostra `degraded`
- Worker não está processando a fila → verificar logs do BullMQ
- `web_push_subscription = NULL` no banco → subscription nunca foi salva

---

## Camada 7 — Push Service (FCM / APNs Web)

**O que verificar:** O push chegou ao serviço de push do navegador

**Código relevante:** `apps/api/src/infrastructure/push/webPush.ts` — `sendWebPush()`

```ts
await webpush.sendNotification(subscription, JSON.stringify({ title, body, url }))
```

**Logs do backend:**
- `[WebPush] Enviando para endpoint: https://fcm.googleapis.com/fcm/send/...` → enviado com sucesso
- `[WebPush] Subscription expirada (410)` → subscription inválida/revogada — worker remove do banco
- `[WebPush] Falha ao enviar notificação: ...` → erro de rede ou push service rejeitou

**Possíveis falhas:**
- **410 Gone**: Subscription expirou. O backend a remove. O frontend precisa criar uma nova (volte para Camada 4).
- **403 Forbidden**: Chave VAPID inválida ou endpoint errado — verifique Camada 1.
- **201 Created**: ✅ Push enviado com sucesso ao push service.

---

## Camada 8 (Final) — Service Worker → Notificação no Dispositivo

**O que verificar:** O service worker recebeu o evento `push` e mostrou a notificação

**Código relevante:** `apps/web/public/sw.js:53-67`

```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title || 'ENDORFINAPP'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 400],
    tag: 'endorfinapp-treino',
    renotify: true,
    data: { url: data.url || data.url_estudo || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})
```

**Possíveis falhas:**
- **SW não está ativo**: Verificar `chrome://serviceworker-internals/` ou `about:debugging#/runtime/this-firefox`
- **Notificação aparece mas é silenciada**: Verificar configurações de Notificação do SO (Focus Assist no Windows, Do Not Disturb no macOS)
- **Notificação aparece mas ao clicar não abre o app**: Verificar handler `notificationclick` (linhas 69-87 do `sw.js`)
- **PWA instalado mas notificação abre no Chrome em vez do app**: Verificar `scope` do service worker e manifest `start_url`

---

## Ferramentas de diagnóstico

### No navegador (usuário final / dev)
| Ferramenta | Como acessar |
|---|---|
| **DebugOverlay** | Ícone 🐛 no menu lateral → painel "Push / Notificações" |
| **Console logs** | `[Push]` prefixado — filtre por "Push" no DevTools |
| **Service Worker** | Chrome DevTools → Application → Service Workers |
| **Push subscriptions** | Chrome DevTools → Application → Storage → Push Messaging |
| **Notificações** | `chrome://settings/content/notifications` → verificar permissões do site |

### No backend (dev)
| Ferramenta | Como acessar |
|---|---|
| **`GET /health`** | `curl https://api-production-3360.up.railway.app/health` |
| **Logs Railway** | Painel Railway → serviço API → Deployments → View Logs |
| **Query direta** | `SELECT id, email, web_push_subscription FROM usuarios WHERE web_push_subscription IS NOT NULL` |
| **Workers BullMQ** | Logs do Railway mostram início/falha de workers |

---

## Checklist rápida de diagnóstico

Quando um usuário reportar "não recebo notificações", siga esta ordem:

```
□ 1. GET /health → vapid.configured === true?
□ 2. Railway Web → VITE_VAPID_PUBLIC_KEY presente? (se adicionada depois, fez redeploy?)
□ 3. DebugOverlay → Permission === 'granted'?
□ 4. DebugOverlay → Subscription === 'ativa'?
□ 5. Banco → web_push_subscription IS NOT NULL para este usuário?
□ 6. GET /health → workers.social.available === true? workers funcionando?
□ 7. Logs Railway → [WebPush] Enviando para endpoint... (sem erro 403/410)?
□ 8. chrome://serviceworker-internals → SW ativo? Notificações do SO não estão silenciadas?
```

---

## Causas comuns e soluções

| Sintoma | Causa provável | Solução |
|---|---|---|
| Push nunca chega, `GET /health` mostra VAPID=false | Variáveis ausentes no Railway API | Adicionar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` → redeploy |
| Push nunca chega, DebugOverlay mostra "VAPID no build: não" | `VITE_VAPID_PUBLIC_KEY` ausente no Railway Web | Adicionar no serviço Web → redeploy |
| Push nunca chega, DebugOverlay mostra "Subscription: nenhuma" | Usuário nunca clicou "Ativar" | Instruir usuário a aceitar notificações |
| Push nunca chega, DebugOverlay mostra "Subscription: ativa" | Subscription expirada ou worker parado | Verificar logs do backend; usuário pode precisar reabrir o app para renovar subscription |
| Push chega mas sem som/vibração | Configuração do SO (Focus Assist, Do Not Disturb) | Instruir usuário a verificar configurações do dispositivo |
| Push chega no Chrome mas não no PWA instalado | Escopo do SW não cobre o PWA | Verificar `manifest.json` → `scope` e `start_url` |
