import { OpenAI } from 'openai';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

const client = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEP_SEEK_API || '',
});

async function main() {
  console.log('Testando API DeepSeek...');
  try {
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Olá! Responda apenas com: "DeepSeek funcionando perfeitamente!"' }],
    });
    console.log('Resposta:', response.choices[0].message.content);
  } catch (err) {
    console.error('Erro na API:', err);
  }
}

main();
