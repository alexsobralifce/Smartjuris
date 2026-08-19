import { Request, Response, NextFunction } from 'express';

interface AttemptRecord {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  prefix: string;
  windowMs: number;
  max: number;
  message: string;
}

// Factory that creates an independent in-memory rate limiter.
// Each instance keeps its own Map and lazily prunes expired entries.
export function createRateLimiter(opts: RateLimiterOptions) {
  const attempts = new Map<string, AttemptRecord>();

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();

    // Lazy pruning to avoid unbounded growth
    if (attempts.size > 1000) {
      for (const [key, record] of attempts) {
        if (record.resetAt <= now) {
          attempts.delete(key);
        }
      }
    }

    // Distinct prefix per limiter so they don't share counters
    const key = `${opts.prefix}:${req.ip || 'unknown'}`;
    const record = attempts.get(key);

    if (!record || record.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    record.count += 1;
    if (record.count > opts.max) {
      return res.status(429).json({ error: opts.message });
    }

    return next();
  };
}

export const loginRateLimiter = createRateLimiter({
  prefix: 'login:',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
});

export const globalApiLimiter = createRateLimiter({
  prefix: 'global:',
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000,
  message: 'Muitas requisições. Tente novamente em instantes.',
});

export const aiRateLimiter = createRateLimiter({
  prefix: 'ai:',
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30,
  message: 'Limite de gerações de IA atingido. Aguarde alguns minutos e tente novamente.',
});
