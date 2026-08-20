import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (raw && /^[a-fA-F0-9]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATA_ENCRYPTION_KEY (64 hex chars) is required in production for field encryption.');
  }
  const secret = process.env.JWT_SECRET || 'dev-insecure-secret';
  console.warn('[crypto] DATA_ENCRYPTION_KEY not set; deriving a dev key from JWT_SECRET.');
  return createHash('sha256').update(secret).digest(); // 32 bytes
}

export function encryptField(plain: string): string {
  if (plain == null) return plain as any;
  if (plain.startsWith(PREFIX)) return plain; // already encrypted (idempotent)
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString('base64')).join(':');
}

export function decryptField(value: string): string {
  if (value == null) return value as any;
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext (dados antigos sem criptografia)
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    // Valor com prefixo indica que DEVERIA ser descriptografável;
    // servir o texto cifrado como resposta mascararia falhas de configuração/descriptografia.
    throw new Error('Campo criptografado com formato inválido.');
  }
  const [iv, tag, ct] = parts.map((p) => Buffer.from(p, 'base64'));
  const key = getKey();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('[crypto] Failed to decrypt field:', e);
    // Chave incorreta/dado corrompido: propaga o erro para a rota retornar 500
    // em vez de silenciosamente devolver o ciphertext como se fosse o valor real.
    throw new Error('Falha ao descriptografar campo.');
  }
}
