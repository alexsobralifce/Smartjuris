// ===========================================================================
// Fase 6F — URL base da API e portal configuráveis via env, sem expor chave.
// ===========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { apiUrlJurisprudencias, portalUrlJurisprudencias, validarUrlJurisprudencias, hostJurisprudenciasPermitido } from './jurisprudencias.js';

describe('acesso ao portal e URL configurável (fase 6F)', () => {
  test('apiUrlJurisprudencias: default atual quando env ausente/vazia', () => {
    assert.equal(apiUrlJurisprudencias({} as NodeJS.ProcessEnv), 'https://jurisprudencias.ai/api/v1', 'default = URL atual');
    assert.equal(apiUrlJurisprudencias({ JURISPRUDENCIAS_API_URL: '' } as NodeJS.ProcessEnv), 'https://jurisprudencias.ai/api/v1', 'env vazia → default');
    assert.equal(apiUrlJurisprudencias({ JURISPRUDENCIAS_API_URL: '   ' } as NodeJS.ProcessEnv), 'https://jurisprudencias.ai/api/v1', 'env só espaços → default');
  });

  test('apiUrlJurisprudencias: usa a env configurada (staging/sandbox) e normaliza a barra final', () => {
    assert.equal(apiUrlJurisprudencias({ JURISPRUDENCIAS_API_URL: 'https://staging.jurisprudencias.ai/api/v1' } as NodeJS.ProcessEnv), 'https://staging.jurisprudencias.ai/api/v1');
    assert.equal(apiUrlJurisprudencias({ JURISPRUDENCIAS_API_URL: 'https://staging.jurisprudencias.ai/api/v1/' } as NodeJS.ProcessEnv), 'https://staging.jurisprudencias.ai/api/v1', 'barra final removida');
  });

  test('validarUrlJurisprudencias: rejeita destinos que exfiltrariam a chave (allowlist + HTTPS)', () => {
    // Válidos: host aprovado + HTTPS.
    assert.ok(validarUrlJurisprudencias('https://jurisprudencias.ai/api/v1'));
    assert.ok(validarUrlJurisprudencias('https://sandbox.jurisprudencias.ai/api/v1'));
    assert.ok(hostJurisprudenciasPermitido('JURISPRUDENCIAS.AI'), 'host case-insensitive');
    assert.ok(hostJurisprudenciasPermitido('api.jurisprudencias.ai'));
    // Inválidos: host fora da allowlist, HTTP, userinfo, URL quebrada.
    assert.equal(validarUrlJurisprudencias('https://evil.com/api/v1'), null, 'host não aprovado');
    assert.equal(validarUrlJurisprudencias('http://jurisprudencias.ai/api/v1'), null, 'HTTP sem TLS');
    assert.equal(validarUrlJurisprudencias('https://jurisprudencias.ai@evil.com/x'), null, 'userinfo/confusão de host');
    assert.equal(validarUrlJurisprudencias('https://evil.jurisprudencias.ai.x/api'), null, 'sufixo falso (.ai.x)');
    assert.equal(validarUrlJurisprudencias('not a url'), null, 'URL quebrada');
    assert.equal(validarUrlJurisprudencias('https://localhost:6379/'), null, 'localhost fora da allowlist');
  });

  test('apiUrlJurisprudencias: LANÇA se a env estiver presente mas for inválida (nunca envia a chave)', () => {
    assert.throws(
      () => apiUrlJurisprudencias({ JURISPRUDENCIAS_API_URL: 'https://evil.com/api' } as NodeJS.ProcessEnv),
      /JURISPRUDENCIAS_API_URL inválida/,
      'configuração inválida rejeitada antes de chamada autenticada',
    );
    assert.throws(
      () => apiUrlJurisprudencias({ JURISPRUDENCIAS_API_URL: 'http://jurisprudencias.ai/api' } as NodeJS.ProcessEnv),
      /JURISPRUDENCIAS_API_URL inválida/,
      'HTTP rejeitado',
    );
  });

  test('portalUrlJurisprudencias: URL pública do portal (gestão de conta/planos)', () => {
    assert.equal(portalUrlJurisprudencias(), 'https://jurisprudencias.ai/');
  });

  test('nenhuma função pública expõe a chave de API', () => {
    // As únicas exportações de acesso são URL base e portal — a chave é
    // privada (getApiKey) e nunca aparece no retorno público.
    const publico = JSON.stringify({ api: apiUrlJurisprudencias(), portal: portalUrlJurisprudencias() });
    assert.ok(!publico.toLowerCase().includes('key') && !publico.includes('Bearer'), 'chave não exposta');
  });
});
