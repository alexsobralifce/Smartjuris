// O blog é pré-renderizado no build do web: publicar/despublicar pede um novo deploy do `smartjuris-web` no Railway.
const ENDPOINT = 'https://backboard.railway.com/graphql/v2';
// serviceInstanceRedeploy reaproveita a imagem anterior (sem rodar o build, então o
// prebuild que sincroniza os artigos não roda). serviceInstanceDeployV2 faz um deploy
// novo a partir do código, com build.
const MUTATION = `mutation Deploy($serviceId: String!, $environmentId: String!) {
  serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
}`;

export function rebuildConfigurado(): boolean {
  return Boolean(process.env.RAILWAY_PROJECT_TOKEN && process.env.RAILWAY_WEB_SERVICE_ID && process.env.RAILWAY_ENVIRONMENT_ID);
}

export async function redeployDoSite(): Promise<boolean> {
  if (!rebuildConfigurado()) return false;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Project-Access-Token': process.env.RAILWAY_PROJECT_TOKEN as string },
    body: JSON.stringify({
      query: MUTATION,
      variables: { serviceId: process.env.RAILWAY_WEB_SERVICE_ID, environmentId: process.env.RAILWAY_ENVIRONMENT_ID },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { errors?: Array<{ message: string }> };
  if (!res.ok || json.errors?.length) throw new Error(`Railway: ${json.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
  return true;
}

/** Junta várias alterações seguidas (ex.: publicar 3 artigos) em um único redeploy. `executar`/`esperaMs` são injetáveis. */
export function criarAgendador(executar: () => Promise<unknown>, esperaMs = 90_000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    agendar() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        executar().catch((e) => console.error('[Blog] falha ao pedir redeploy do site:', e instanceof Error ? e.message : e));
      }, esperaMs);
    },
    pendente: () => timer !== null,
  };
}

export const agendadorRebuild = criarAgendador(redeployDoSite);
