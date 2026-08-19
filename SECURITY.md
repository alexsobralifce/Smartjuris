# Segurança & Privacidade (LGPD) — SmartJuris

Postura de segurança do sistema e controles técnicos implementados. Complementa as diretrizes LGPD exibidas no módulo "Documentação" do produto.

## Classificação de Dados

| Dado | Tipo | Nível | Proteção em repouso |
|---|---|---|---|
| `usuarios.senha` | Credencial | Crítico | bcrypt (cost 10; root cost 12) |
| `clientes.cpfCnpj` | CPF/CNPJ | Sensível (LGPD art. 5º, II) | AES-256-GCM (versionado) |
| `lancamentos_financeiros.valor` | Honorários/valores | Sensível | AES-256-GCM (versionado) |
| `clientes.*` (endereço, telefone, email, qualificação) | PII | Sensível | Texto plano — *recomenda-se estender a criptografia* |
| `pecas.conteudo`, `chunks.texto`, `andamentos.descricao` | Conteúdo jurídico | Confidencial | Em repouso; excluído da trilha de auditoria |

## Criptografia em Repouso

- **Algoritmo**: AES-256-GCM, formato versionado `enc:v1:<iv>:<tag>:<ct>` (base64).
- **Chave**: `DATA_ENCRYPTION_KEY` (64 caracteres hex). Em produção é obrigatória (falha ao iniciar se ausente); em dev deriva de `JWT_SECRET`.
- **Compatibilidade**: leitura tolera legado — valores sem o prefixo `enc:v1:` são retornados como texto plano (migração gradual; novos writes já saem criptografados).

## Minimização de Dados (LGPD art. 6º, III)

- `redactPII()` remove CPF/CNPJ/email/telefone/CEP antes de enviar texto ao LLM (resumo de andamentos). O dado original permanece no banco; apenas o prompt é redigido.
- A trilha de auditoria (`audit_log`) omite `conteudo` (peças) e `descricao` (andamentos).

## Compartilhamento com Terceiros (DPA)

- **DeepSeek** (geração de peças e resumo) e **Ollama/BGE-M3** (embeddings) processam dados de casos.
- ⚠️ Antes de processar dados reais de clientes, é necessário firmar **DPA** (contrato de operador/processador) com cada provedor, conforme LGPD arts. 26 e 39. Sem DPA, limitar o uso a dados de demonstração.

## Retenção & Exclusão (Direito ao Esquecimento)

- **Exclusão**: `DELETE /api/clientes/:id` (somente admin/root, auditado) remove o registro do cliente.
- Processos/peças referenciam o cliente por texto (sem FK). Para erradicação completa de um titular, excluir também os registros vinculados (processos, peças, andamentos, financeiro, timesheet, documentos).
- **Política recomendada**: reter pelo período da relação contratual + prazos legais/de prescrição (OAB/LGPD); eliminar após o prazo.

## Controles Implementados (resumo)

- **Autenticação**: JWT em cookie `httpOnly` (`SameSite=Lax`, `Secure` em produção) + revogação por `jti` (denylist) + logout real.
- **Abuso**: rate limit (login / global / IA) + lockout por e-mail.
- **Autorização**: RBAC (`root`/`admin`/`user`) + autorização por objeto (dono ou admin) + `DELETE` restrito a admin/root.
- **Integridade**: validação de entrada com zod (anti mass-assignment), auditoria em todas as mutações, congelamento de peças aprovadas, `updatedAt`/`updatedBy`.
- **Upload**: PDF ≤ 15 MB, validação de MIME + magic bytes.
- **Disponibilidade**: timeout/abort no stream SSE de IA, graceful shutdown, tratamento de `uncaughtException`/`unhandledRejection`.
- **Segredos**: `JWT_SECRET` (≥32 chars) e `ROOT_PASSWORD` (≥12 em produção) exigidos; sem credenciais hardcoded.
