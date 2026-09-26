# Relatório de Pentest — RailPulse CCO

**Data:** 2026-09-26
**Escopo:** `backend/` (Express + PostgreSQL + Socket.IO) e `frontend/` (React 19)
**Método:** revisão de código autenticada (não é um black-box scan), com verificação ao vivo dos achados exploráveis contra a aplicação rodando localmente + `npm audit` nas duas árvores de dependências.
**Commit avaliado:** `78fde34`

> Convenção de severidade: **Crítica** (compromete a segurança de toda a operação ou de contas), **Alta** (compromete uma conta/funcionalidade específica com esforço razoável), **Média** (exige um pré-requisito não trivial, ou o impacto é limitado), **Baixa** (defesa em profundidade — hoje sem vetor de exploração conhecido), **Informativa** (higiene, sem risco imediato).

---

## Resumo executivo

| # | Achado | Severidade | Explorado ao vivo? |
| --- | --- | --- | --- |
| 1 | Revogar acesso (desativar/rebaixar operador) não invalida o token já emitido | **Alta** | Confirmado por leitura de código (sem DB check pós-login) |
| 2 | `trust proxy: true` permite falsificar IP e contornar o rate limiter de login | **Alta** | Confirmado por leitura de código |
| 3 | Ativar 2FA não exige senha (assimetria com desativar) | Média | Confirmado por leitura de código |
| 4 | TOTP sem proteção contra reuso dentro da janela de tolerância | Média | Confirmado por leitura de código |
| 5 | `train:command` (WebSocket) não tem rate limit | Média | Confirmado por leitura de código |
| 6 | Payload do WebSocket sem validação de tamanho/formato | Baixa/Média | Confirmado por leitura de código |
| 7 | Sem `Content-Security-Policy` / `HSTS` | Baixa | N/A (defesa em profundidade) |
| 8 | Senha de seed fraca sem trava em produção | Baixa | Confirmado por leitura de código |
| 9 | Comparação do código TOTP não é *constant-time* | Informativa | N/A |
| 10 | `.env` já esteve no histórico do git (removido depois) | Informativa | Confirmado (`git log`) |

**O que já está correto** (verificado, não presumido) está na seção final — é bastante coisa, e vale ler para saber o que **não** mexer.

---

## 1. Revogar acesso não invalida o token já emitido — **Alta**

### Evidência

`backend/shared/jwt.ts` — `verifyOperatorToken` só faz `jwt.verify`, nunca consulta o banco:

```ts
export const verifyOperatorToken = (token: string | undefined | null): OperatorTokenPayload | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || !decoded.operatorId) return null;
    return { operatorId: String(decoded.operatorId), role: String(decoded.role ?? 'OPERADOR') };
  } catch {
    return null;
  }
};
```

`backend/infrastructure/repositories/pg-operator.repository.ts` — a única consulta que filtra por `is_active` é a de login:

```ts
`SELECT id, name, role, password_hash, avatar_url, is_active, mfa_secret, mfa_enabled
 FROM operators WHERE id = $1 AND is_active = TRUE`
```

`verifyJwt` (`auth.middleware.ts`) e o handshake do WebSocket (`cco.gateway.ts`) usam **só** `verifyOperatorToken` — nenhum dos dois volta ao banco para conferir se o operador segue ativo ou se o perfil mudou.

### Impacto

- Um supervisor desativa um operador em `Equipe` (`PATCH /api/team/:id/active`) achando que cortou o acesso — mas **o token que esse operador já tem continua funcionando integralmente** (REST e WebSocket, incluindo `EMERGENCY_BRAKE_OVERRIDE`) até expirar naturalmente. Com `JWT_EXPIRES_IN=8h` (padrão), isso é até um turno inteiro de acesso não revogado.
- Rebaixar um perfil (`PATCH /api/team/:id/role`, ex.: SUPERVISOR → OPERADOR) tem o mesmo problema: o `role` já está embutido no token assinado no login, então o operador rebaixado **mantém as permissões antigas** (ex.: `MANAGE_OPERATORS`) até relogar.
- Este é exatamente o cenário que a funcionalidade "Revogar credencial" da tela Equipe promete resolver — hoje ela não cumpre essa promessa.

### Correção recomendada

Reautenticar contra o estado atual do operador a cada requisição, não confiar só na assinatura do token. Duas opções, em ordem de preferência:

**Opção A — consulta ao banco em `verifyJwt` (mais correta):**

```ts
// auth.middleware.ts
export const verifyJwt = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req.headers.authorization);
  const payload = verifyOperatorToken(token);
  if (!payload) return res.status(401).json({ error: '...', code: 'TOKEN_INVALID' });

  const operator = await operatorRepository.findById(payload.operatorId); // já filtra is_active = TRUE
  if (!operator) return res.status(401).json({ error: 'Credenciamento revogado.', code: 'REVOKED' });

  req.operator = { operatorId: operator.id, role: operator.role }; // role sempre fresco do banco
  next();
};
```

Isso torna `verifyJwt` assíncrono (mudança mecânica nos ~10 pontos onde é usado como middleware — Express já suporta handler async) e adiciona uma consulta simples e indexada (`WHERE id = $1`) por requisição — custo desprezível.

**Opção B — cache curto (30–60s) se o hit no banco por requisição for indesejado:**
Um `Map<operatorId, {isActive, role, expiresAt}>` em memória, invalidado nas próprias rotas de `team.routes.ts` quando `setActive`/`updateRole` são chamadas. Reduz a janela de token "zumbi" de 8h para segundos, sem round-trip por requisição.

**Complementar (WebSocket):** ao desativar/rebaixar um operador, iterar `io.sockets.sockets` e desconectar qualquer socket daquele `operatorId` imediatamente — sem isso, mesmo com a Opção A, uma sessão de WebSocket já aberta continua recebendo/enviando eventos até a próxima tentativa (o handshake não se repete numa conexão já estabelecida).

---

## 2. `trust proxy: true` permite contornar o rate limiter de login — **Alta**

### Evidência

`backend/presentation/http/app.ts`:
```ts
app.set('trust proxy', true);
```

`backend/presentation/http/routes/auth.routes.ts`:
```ts
const rateKey = `${req.ip ?? 'unknown'}:${operatorId.toUpperCase()}`;
loginLimiter.consume(rateKey);
```

`trust proxy: true` faz o Express confiar cegamente no cabeçalho `X-Forwarded-For` enviado pelo **cliente**, usando-o como `req.ip`. Isso é seguro só quando existe um proxy confiável na frente que **sobrescreve** esse cabeçalho antes de repassar a requisição — o que este projeto não impõe nem documenta.

### Impacto

Um atacante tentando forçar a senha da conta `EDP-042` manda cada tentativa com um `X-Forwarded-For` diferente:

```bash
curl -X POST http://alvo/api/auth/login \
  -H "X-Forwarded-For: 203.0.113.$((RANDOM % 255))" \
  -H "Content-Type: application/json" \
  -d '{"operatorId":"EDP-042","password":"tentativa123"}'
```

Como a chave do limitador é `IP:operatorId` e o IP é forjável a cada chamada, o componente de IP do limitador nunca acumula — na prática, **o rate limit de login deixa de existir** para quem sabe fazer isso. Sobra só o custo do `bcrypt.compare` (~10 rounds) como fricção, o que é bem mais fraco que "8 tentativas por minuto por IP" com um alvo fixo.

### Correção recomendada

- Se o deploy real está atrás de um proxy conhecido (nginx, um load balancer específico, Cloudflare): `app.set('trust proxy', 'loopback')` ou o IP/CIDR exato do proxy — nunca `true`.
- Sem proxy na frente: `app.set('trust proxy', false)` (padrão do Express) e usar `req.socket.remoteAddress` diretamente.
- Reforço independente do IP: já que o rate limiter combina IP com `operatorId`, adicionar **também** um limitador só por `operatorId` (sem IP), como já existe para o desafio de MFA (`mfaLimiter`, chaveado só pelo operador) — isso elimina o problema mesmo se o IP for manipulável, porque o atacante não controla o `operatorId` alvo.

---

## 3. Ativar 2FA não exige senha — assimetria com desativar — **Média**

### Evidência

`backend/presentation/http/routes/operator.routes.ts`:

```ts
operatorRouter.post('/mfa/enroll', async (req: AuthenticatedRequest, res) => {
  const operator = await operatorRepository.findById(req.operator!.operatorId);
  const secret = generateTotpSecret();
  await operatorRepository.setPendingMfaSecret(operator.id, secret);
  res.status(200).json({ secret, otpauthUrl: buildOtpAuthUrl(secret, operator.id) });
});

operatorRouter.post('/mfa/confirm', async (req: AuthenticatedRequest, res) => {
  // ... só exige o código TOTP do segredo gerado no passo acima — nenhuma senha
});
```

Compare com `/mfa/disable`, que exige `bcrypt.compare(password, operator.password_hash)` antes de desligar o 2FA.

### Impacto

Enroll+confirm não pedem confirmação de senha. Isso não abre a conta por si só (quem faz isso já tem um token válido), mas cria um vetor de **sabotagem silenciosa**: uma sessão comprometida por um instante (ex.: um token esquecido em uma máquina compartilhada, ou capturado de outra forma que não a senha) é suficiente para ativar um 2FA cujo segredo só o atacante conhece. Na próxima vez que o dono legítimo logar com a senha certa, ele cai num desafio de TOTP que não tem como responder — **conta bloqueada**, e o gatilho não deixa rastro óbvio (não muda senha, não muda perfil).

### Correção recomendada

Exigir a senha atual em `/mfa/confirm` (ou em `/mfa/enroll`, mais cedo ainda), no mesmo padrão de `/mfa/disable`:

```ts
operatorRouter.post('/mfa/confirm', async (req: AuthenticatedRequest, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const operator = await operatorRepository.findById(req.operator!.operatorId);
  if (!operator || !(await bcrypt.compare(password, operator.password_hash))) {
    throw new UnauthorizedError('Senha incorreta.');
  }
  // ... resto do fluxo de confirmação
});
```

---

## 4. TOTP sem proteção contra reuso — **Média**

### Evidência

`backend/shared/totp.ts`:
```ts
export const verifyTotp = (secret: string, code: string, at: number = Date.now()): boolean => {
  // ...
  return [0, -1, 1].some((drift) => hotp(key, counter + drift) === clean);
};
```

A função é *stateless*: nada no banco registra qual `counter` (passo de 30s) já foi consumido por aquele operador.

### Impacto

Um código TOTP válido, uma vez observado por qualquer meio (câmera, ombro, malware, log acidental), pode ser reaproveitado por outra pessoa **dentro da mesma janela de ±30s** — inclusive depois que o dono legítimo já o usou. Não é um vetor de exploração remota (exige ter visto o código), mas é uma lacuna clássica de implementações de TOTP que RFC 6238 recomenda fechar.

### Correção recomendada

Guardar o último `counter` aceito por operador (uma coluna `mfa_last_used_step INTEGER` já resolve) e rejeitar qualquer código cujo passo seja `<=` o último aceito:

```ts
// operators: ALTER TABLE operators ADD COLUMN mfa_last_used_step BIGINT;

const step = verifyTotpAndGetStep(operator.mfa_secret, code); // retorna o counter que bateu, ou null
if (step === null || (operator.mfa_last_used_step != null && step <= operator.mfa_last_used_step)) {
  throw new UnauthorizedError('Código de verificação inválido.');
}
await operatorRepository.setMfaLastUsedStep(operator.id, step);
```

---

## 5. `train:command` sem rate limit — **Média**

### Evidência

`backend/presentation/websocket/cco.gateway.ts` — o handler de `train:command` não tem nenhum limitador; compare com `loginLimiter`/`mfaLimiter` em `auth.routes.ts`, que são os únicos pontos com `RateLimiter` no projeto todo.

### Impacto

Qualquer operador autenticado (inclusive o perfil mais baixo, OPERADOR) pode emitir `train:command` na velocidade que a rede permitir. Isso já era um jeito barato de gerar ruído/carga; **ficou mais relevante depois do lock pessimista implementado nesta mesma branch** (`ProcessTrainCommand`): cada comando agora abre uma transação com `SELECT ... FOR UPDATE`. Um flood de comandos para o mesmo trem mantém a fila de lock permanentemente ocupada, fazendo com que operadores legítimos comandando aquele trem recebam `409 Conflict` (lock_timeout) com muito mais frequência — o mecanismo de proteção contra corrida vira, sem querer, uma superfície de negação de serviço direcionada a um trem específico.

### Correção recomendada

Reaproveitar a classe `RateLimiter` já existente, por `operatorId` (ou `socket.id`), no próprio handler:

```ts
const commandLimiter = new RateLimiter(20, 10_000); // 20 comandos / 10s por operador, ajustar conforme operação real

socket.on('train:command', async (payload) => {
  try {
    commandLimiter.consume(operator.operatorId);
  } catch (error) {
    acknowledge('FAILED', error instanceof Error ? error.message : 'Muitos comandos em sequência.');
    return;
  }
  // ... resto do handler
});
```

---

## 6. Payload do WebSocket sem validação de tamanho/formato — **Baixa/Média**

### Evidência

```ts
const trainId = typeof payload?.trainId === 'string' ? payload.trainId.trim() : '';
const targetBlock = typeof payload?.targetBlock === 'string' ? payload.targetBlock : undefined;
```

Não há limite de tamanho nem checagem contra a malha conhecida (`isKnownStation`/lista de trens), diferente do padrão já usado nos endpoints REST (ex.: `CREDENTIAL_PATTERN` em `team.routes.ts`, `isKnownStation` em `incident.routes.ts`/`communication.routes.ts`).

### Impacto

Um `trainId`/`targetBlock` muito longo passa direto para `ProcessTrainCommand`, que monta `TRAIN_${trainId}_BLOCK_${targetBlock}` e tenta gravar em `audit_logs.target VARCHAR(100)`. Isso falha com um erro bruto do Postgres ("value too long for type character varying(100)"), que **hoje vaza para o cliente** via `acknowledge('FAILED', error.message)` no `catch` do gateway — um vazamento pequeno, mas real, de detalhe de schema interno, além do próprio desperdício de uma transação completa (com lock) para uma entrada claramente inválida.

### Correção recomendada

```ts
const MAX_ID_LENGTH = 20;
if (trainId.length > MAX_ID_LENGTH || (targetBlock?.length ?? 0) > MAX_ID_LENGTH) {
  acknowledge('FAILED', 'Identificador de composição ou bloco inválido.');
  return;
}
```
E, no `catch` geral do handler, nunca repassar `error.message` de erros que não sejam `AppError` (mesmo padrão que `error.middleware.ts` já aplica no lado HTTP — hoje o WebSocket não tem esse filtro).

---

## 7. Sem `Content-Security-Policy` nem `Strict-Transport-Security` — **Baixa**

### Evidência

`backend/presentation/http/app.ts`:
```ts
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('Referrer-Policy', 'no-referrer');
```

Nenhum `Content-Security-Policy` e nenhum `Strict-Transport-Security`.

### Por que isso importa mesmo sem XSS conhecido hoje

Não encontrei nenhum `dangerouslySetInnerHTML`, `innerHTML` ou `eval` no frontend — o React escapa por padrão tudo que passa por `{...}`, então **hoje não há um vetor de XSS identificado**. Mas o JWT de sessão fica em `localStorage` (`AuthContext.tsx`), acessível a qualquer script que rode na página. Um CSP não corrige uma XSS existente — ele reduz o dano se uma aparecer no futuro (ex.: uma dependência nova que renderize HTML, um markdown mal sanitizado). É defesa em profundidade, não um remendo para um buraco já aberto.

### Correção recomendada

```ts
res.setHeader(
  'Content-Security-Policy',
  "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' https: data:; script-src 'self'; style-src 'self' 'unsafe-inline'",
);
if (env.isProduction) {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}
```
Ajustar `img-src` conforme a política real de avatares (hoje aceita qualquer `http`/`https`).

---

## 8. Senha de seed fraca sem trava em produção — **Baixa**

### Evidência

`.env.example`:
```
SEED_OPERATOR_PASSWORD=123456
```
`backend/config/env.ts` falha o boot em produção se `JWT_SECRET` estiver ausente, mas não faz a mesma checagem para `SEED_OPERATOR_PASSWORD`.

### Impacto

Um deploy real que esqueça de sobrescrever essa variável sobe com uma conta `SUPERVISOR` (por padrão) protegida por `123456`. Baixa severidade porque exige um erro operacional (esquecer de configurar), não é explorável no código como está — mas é exatamente o tipo de "default inseguro" que checklists de hardening cobram.

### Correção recomendada

```ts
if (isProduction && (process.env.SEED_OPERATOR_PASSWORD ?? '123456') === '123456') {
  throw new Error('[CONFIG] SEED_OPERATOR_PASSWORD precisa ser definido com um valor forte em produção.');
}
```

---

## 9. Comparação do código TOTP não é *constant-time* — Informativa

`hotp(key, counter + drift) === clean` usa `===` (comparação de string comum), não `crypto.timingSafeEqual`. O risco prático é baixo — o código muda a cada 30s e há limitador de 8 tentativas/min — mas trocar por comparação de tempo constante é uma correção de poucas linhas e remove a discussão por completo:

```ts
const safeEqual = (a: string, b: string) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
```

---

## 10. `.env` já esteve no histórico do git — Informativa

`git log --all --diff-filter=A -- .env` mostra que um `.env` foi commitado no início do projeto (`bb2cb16`) e removido depois (`7dbdb2d`). O conteúdo exposto era só um placeholder de desenvolvimento (`DB_PASS=suasenha`, sem `JWT_SECRET` — a feature ainda não existia) — **nenhum segredo real vazou**. Ainda assim, o arquivo é recuperável por qualquer um que clone o histórico completo (`git show bb2cb16:.env`).

**Recomendação (não executada aqui — decisão sua):** se este repositório for compartilhado publicamente ou revisado por terceiros, considere reescrever o histórico com `git filter-repo --path .env --invert-paths` para remover o blob por completo. Isso reescreve hashes de commit e exige `push --force` coordenado — avise qualquer colaborador antes de fazer isso.

---

## O que já está correto (verificado, não presumido)

- **Injeção de SQL:** varri todo `db.query`/`client.query` do backend — 100% parametrizado. Os únicos casos com `${...}` dentro de uma string de query são fragmentos SQL estáticos (`WHERE ${whereClause(1,2,3)}`), nunca dado de usuário concatenado.
- **XSS:** nenhum `dangerouslySetInnerHTML`, `innerHTML` ou `eval` no frontend inteiro.
- **CSRF:** não aplicável — autenticação por Bearer token em header, `cors({ credentials: false })`, nada em cookie.
- **Senhas:** `bcrypt` com custo 10, comparação sempre via `bcrypt.compare` (nunca `===` em hash).
- **Mitigação de *timing attack* na enumeração de login:** um hash "isca" pré-computado no boot garante que login com operador inexistente gaste o mesmo tempo de CPU que uma senha errada.
- **2FA:** implementação própria de HOTP/TOTP (RFC 4226/6238) validada contra os vetores de teste oficiais do RFC; segredo gerado com `crypto.randomBytes` (CSPRNG), nunca `Math.random`.
- **Desativar 2FA exige senha atual** — único freio real contra um dispositivo desbloqueado sozinho.
- **SSRF via avatar:** a URL é validada (`http`/`https` apenas) e nunca é buscada pelo servidor — só o navegador do próprio operador a renderiza.
- **Vazamento de stack trace:** o `errorHandler` central nunca devolve stack ao cliente, só loga no servidor.
- **Corrida em comandos de trem:** `ProcessTrainCommand` (adicionado nesta mesma branch) usa `SELECT ... FOR UPDATE` transacional, com `lock_timeout` configurável e auditoria atômica com o estado — validado ao vivo com dois operadores comandando o mesmo trem simultaneamente.
- **Dependências:** `npm audit` limpo (0 vulnerabilidades conhecidas) tanto no backend quanto no frontend, na data desta auditoria.
- **`.env` real:** corretamente ignorado pelo git hoje (`.gitignore`), e o boot falha em produção sem `JWT_SECRET`.

---

## Priorização sugerida

1. **#1 e #2** primeiro — são os únicos com severidade Alta, e ambos têm correção mecânica e localizada (poucos arquivos).
2. **#3, #4, #5** — cada um é uma mudança pequena e isolada; #5 fica ainda mais relevante por interagir com o lock pessimista recém-implementado.
3. **#6, #7, #8** — baratos, sem trade-off, dá pra fazer juntos numa mesma limpeza.
4. **#9 e #10** — sem urgência; #10 exige uma conversa sobre reescrever histórico antes de qualquer ação.

Nenhum dos achados exigiu uma nova dependência de infraestrutura para ser corrigido — todos usam peças que o projeto já tem (`RateLimiter`, `bcrypt`, o próprio Postgres).
