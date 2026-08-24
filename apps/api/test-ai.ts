import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// .env da raiz do monorepo, resolvido a partir do próprio script
// (independe do diretório de onde o comando é executado).
const aqui = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(aqui, '../../.env') });

// Teste manual de conectividade com o provedor de IA (Token Plan / Qwen).
// Espelha a resolução de configuração de services/ai.ts:
//   baseURL: AI_BASE_URL || DEEPSEEK_BASE_URL || endpoint padrão do Token Plan
//   modelo:  DEEPSEEK_MODEL || qwen3.7-plus
// Uso (a partir da raiz): pnpm dlx tsx apps/api/test-ai.ts

const baseURL =
  process.env.AI_BASE_URL ||
  process.env.DEEPSEEK_BASE_URL ||
  'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
const modelo = process.env.DEEPSEEK_MODEL || 'qwen3.7-plus';

const client = new OpenAI({
  baseURL,
  apiKey: process.env.DEEP_SEEK_API || '',
});

async function main() {
  console.log(`Testando provedor de IA: ${baseURL}`);
  console.log(`Modelo: ${modelo}`);
  try {
    const response = await client.chat.completions.create({
      model: modelo,
      // Economia do plano: desliga o raciocínio dos modelos Qwen (tokens de
      // raciocínio são cobrados como saída).
      ...(modelo.toLowerCase().startsWith('qwen') ? { enable_thinking: false } : {}),
      messages: [{ role: 'user', content: 'Olá! Responda apenas com: "IA funcionando perfeitamente!"' }],
    });
    console.log('Resposta:', response.choices[0].message.content);
    console.log('Uso (tokens):', response.usage);
  } catch (err) {
    console.error('Erro na API:', err);
    process.exitCode = 1;
  }
}

main();
