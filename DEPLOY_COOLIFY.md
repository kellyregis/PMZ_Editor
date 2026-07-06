# Deploy OpenCut (PMZ_Editor) self-host no Coolify

Guia de deploy do fork como **app Node standalone** (sem o caminho Cloudflare /
`@opennextjs/cloudflare` / `wrangler`). Usa o `apps/web/Dockerfile` (build
`next build` → `.next/standalone` → `bun apps/web/server.js`).

Arquivo de deploy: **`docker-compose.coolify.yml`** (raiz).

## Serviços

| Serviço      | Imagem / build                    | Exposto? | Papel |
|--------------|-----------------------------------|----------|-------|
| `oc-db`      | `postgres:17`                     | interno  | Banco (schema OpenCut) |
| `oc-redis`   | `redis:7-alpine`                  | interno  | Redis para rate-limit |
| `oc-srh`     | `hiett/serverless-redis-http`     | interno  | Proxy Upstash-REST → Redis |
| `oc-migrate` | build `apps/web/Dockerfile` (stage `builder`) | one-shot | Roda `drizzle-kit migrate` e sai |
| `oc-web`     | build `apps/web/Dockerfile` (stage `runner`)  | **domínio** | App Next 16 standalone |

Coolify gerencia rede + Traefik via `docker_compose_domains`. Por isso **não há
labels, redes ou portas publicadas manuais**. No painel do Coolify, aponte o
domínio `editor.<DOMAIN>` para o serviço `oc-web` (porta interna 3000).

## Variáveis de ambiente

### Definir no painel do Coolify (interpoladas no compose)

| Var Coolify      | Exemplo / como gerar                 | Uso |
|------------------|--------------------------------------|-----|
| `DOMAIN`         | `pmz.example.com`                    | Web servido em `https://editor.<DOMAIN>` |
| `OC_DB_PASSWORD` | `openssl rand -hex 24`               | Senha do usuário postgres `opencut` |
| `OC_SRH_TOKEN`   | `openssl rand -hex 24`               | Token compartilhado oc-srh ↔ oc-web |
| `OC_AUTH_SECRET` | `openssl rand -hex 32`               | Segredo do better-auth |

Opcionais (integração pmz-clipper + Freesound). Todas têm default no compose; só setar quando for ligar a feature:

| Var Coolify           | Default                                   | Uso |
|-----------------------|-------------------------------------------|-----|
| `OC_PMZ_SSO_SECRET`   | *(vazio → SSO desligado, bridge 501)*     | Segredo HS256 compartilhado com o pmz-clipper (assina o JWT de SSO + autoriza a chamada de clip-data). Gerar `openssl rand -hex 32` e usar o MESMO valor no app. |
| `OC_PMZ_REQUIRE_SSO`  | `false`                                   | `true` liga o gate (sem sessão → redirect pro app). **Deixar `false` até o lado do app estar pronto.** |
| `OC_PMZ_CLIPPER_API`  | `https://api.pmzclips.pandoramodz.com.br` | Base URL do backend do clipper (endpoint `/editor/clip-data/{id}`). |
| `OC_PMZ_APP_URL`      | `https://pmzclips.pandoramodz.com.br`     | URL do app (redirect de não-autenticados / token inválido). |
| `OC_FREESOUND_API_KEY`| `build-placeholder`                       | Chave real do Freesound → acende o banco de sons (filtrado a CC0). Sem ela, busca de sons fica inerte. |

### Env do app (validadas pelo zod em `apps/web/src/env/web.ts` no boot)

O módulo `src/env/web.ts` faz `webEnvSchema.parse(process.env)` no import. Se
**qualquer** campo obrigatório faltar, o processo **não sobe**. Por isso os
opcionais recebem placeholder.

**Obrigatórias (o core não sobe sem elas):**

| Env                        | Valor no compose                                   | Observação |
|----------------------------|----------------------------------------------------|------------|
| `NODE_ENV`                 | `production`                                        | enum |
| `DATABASE_URL`             | `postgres://opencut:${OC_DB_PASSWORD}@oc-db:5432/opencut` | precisa começar com `postgres://` ou `postgresql://` |
| `BETTER_AUTH_SECRET`       | `${OC_AUTH_SECRET}`                                 | segredo do better-auth |
| `UPSTASH_REDIS_REST_URL`   | `http://oc-srh:80`                                  | precisa ser URL válida |
| `UPSTASH_REDIS_REST_TOKEN` | `${OC_SRH_TOKEN}`                                   | = `SRH_TOKEN` do oc-srh |
| `NEXT_PUBLIC_SITE_URL`     | `https://editor.${DOMAIN}`                          | baseURL/trustedOrigins do better-auth. **Também build-arg** (ver abaixo) |
| `NEXT_PUBLIC_MARBLE_API_URL` | `https://api.marblecms.com`                       | zod exige URL válida (mesmo sem usar o blog) |
| `MARBLE_WORKSPACE_KEY`     | `build-placeholder`                                 | placeholder (feature blog) |
| `FREESOUND_CLIENT_ID`      | `build-placeholder`                                 | placeholder (busca de sons) |
| `FREESOUND_API_KEY`        | `build-placeholder`                                 | placeholder (busca de sons) |

**Opcionais reais (features que degradam graciosamente com placeholder):**

- `MARBLE_WORKSPACE_KEY` / `NEXT_PUBLIC_MARBLE_API_URL` → usados só em
  `src/blog/query.ts` (blog/changelog). Com placeholder, o blog não busca posts,
  mas o editor sobe normal.
- `FREESOUND_CLIENT_ID` / `FREESOUND_API_KEY` → usados só em
  `src/app/api/sounds/search/route.ts` (busca de sons). Com placeholder, a busca
  de sons retorna erro/vazio; o resto funciona.
- `ANALYZE`, `NEXT_RUNTIME` → opcionais no schema (não setar).

**Não usada pelo código:** `BETTER_AUTH_URL` — o app usa `NEXT_PUBLIC_SITE_URL`
como `baseURL`. Mantida no compose apenas como alias inofensivo.

### Build-args (inlined no bundle em build time)

Vars `NEXT_PUBLIC_*` são **fixadas no bundle do cliente durante o `next build`**,
não em runtime. Portanto `NEXT_PUBLIC_SITE_URL` (usada pelo `better-auth/react`
client em `src/auth/client.ts`) **precisa** ser passada como build-arg =
`https://editor.<DOMAIN>`, senão o login do cliente aponta para `localhost:3000`.

> Ajuste feito no fork: o `apps/web/Dockerfile` passou a aceitar
> `ARG NEXT_PUBLIC_SITE_URL` (default `http://localhost:3000`, retrocompatível).
> Os demais (`NEXT_PUBLIC_MARBLE_API_URL`, `MARBLE_WORKSPACE_KEY`,
> `FREESOUND_*`) já eram build-args. O compose passa os mesmos args a `oc-web`
> e `oc-migrate` para compartilhar o cache do stage `builder`.

## Migrations

O runner standalone **não contém `drizzle-kit`** (é devDependency e não é
traçado para `.next/standalone`). Solução: serviço one-shot **`oc-migrate`** que
builda o stage `builder` do Dockerfile (tem `node_modules` completo + fonte +
`drizzle.config.ts`) e roda `bun run db:migrate` (= `drizzle-kit migrate`).

- `drizzle-kit migrate` aplica os SQL commitados em `apps/web/migrations/`
  (journal `meta/_journal.json`). **Não lê o `schema` nem gera arquivos**, então
  é seguro no boot e idempotente (registra em `drizzle_migrations`).
- `oc-web` tem `depends_on: oc-migrate: condition: service_completed_successfully`,
  garantindo que o schema exista antes do app subir.
- Não usamos `db:push` (o `schema` path em `drizzle.config.ts` aponta para
  `./src/lib/db/schema.ts`, caminho que não existe neste fork — o schema real
  está em `src/db/schema.ts`; `migrate` não depende desse path, `push` sim).

## Integração pmz-clipper (SSO + import de clipe)

Fluxo end-to-end (nenhuma parte muda o comportamento atual enquanto `PMZ_SSO_SECRET`
estiver vazio):

1. **App gera um JWT** HS256 assinado com `PMZ_SSO_SECRET`. Claims esperadas:
   `{ type:"editor_sso", email, sub, clip_id?, kind?:"clip"|"merge", exp(~5min), jti }`.
   Manda o usuário para `https://editor.<DOMAIN>/api/auth/sso?token=<jwt>`.
2. **Bridge SSO** (`app/api/auth/sso/route.ts`): valida o JWT HS256 (`node:crypto`,
   sem lib externa), faz upsert do
   user por email e cria a sessão better-auth **via API pública** (`signInEmail`/
   `signUpEmail` com senha derivada de `HMAC(PMZ_SSO_SECRET, email)` — nunca exposta;
   o better-auth assina o cookie de sessão corretamente). Se `clip_id` presente →
   redirect `/import?clip_id&kind`; senão → `/projects`. Token inválido/expirado ou
   secret ausente → redirect pro `PMZ_APP_URL` (secret ausente = 501).
3. **Página de import** (`app/import/page.tsx`, client-side): chama o proxy
   `app/api/import/clip-data` (server-to-server, Bearer `PMZ_SSO_SECRET`, valida a
   sessão), baixa `video_url`/`music_url` (presigned MinIO) como `File`, cria o
   projeto via `EditorCore` (managers/commands: `createNewProject` → `addMediaAsset`
   → `buildElementFromMedia`+`insertElement` → `insertCaptionChunksAsTextTrack` →
   `saveCurrentProject`) e redireciona pra `/editor/<projectId>`.
   **Roda no browser** porque `EditorCore`/`storageService` persistem em IndexedDB +
   OPFS (sem equivalente server).
4. **Gate** (`middleware.ts`, flag `PMZ_REQUIRE_SSO`): quando `true`, exige o cookie
   de sessão better-auth em todas as rotas (exceto `/api/auth`, `/api/import`,
   `/import`, health e estáticos); sem cookie → redirect pro `PMZ_APP_URL`. Default
   `false` (no-op).

Requisitos no lado do app / infra (o orquestrador implementa):
- Endpoint `GET {PMZ_CLIPPER_API}/editor/clip-data/{id}?kind=clip|merge` com
  `Authorization: Bearer {PMZ_SSO_SECRET}` → `{ title, video_url, duration_s,
  captions:[{text,start,duration}], music_url? }` (tempos em segundos).
- **CORS no MinIO**: os presigned URLs de `video_url`/`music_url` precisam permitir
  `GET` cross-origin a partir de `https://editor.<DOMAIN>` (o browser baixa direto).
- `PMZ_SSO_SECRET` idêntico nos dois lados.

## Storage backend (Fase 1 — flag)

Por padrão o editor persiste projetos/mídia **localmente** (IndexedDB + OPFS) —
comportamento intacto. Com a flag **`NEXT_PUBLIC_STORAGE_BACKEND=backend`**, os
projetos e binários de mídia passam a ser persistidos no backend do pmz-clipper.

- **Flag (build-time):** `NEXT_PUBLIC_*` é inlinada no bundle no `next build`, então
  precisa ser passada como **build-arg**. No Coolify, setar `OC_STORAGE_BACKEND=backend`
  (o compose repassa como build-arg pra `oc-web` e `oc-migrate`). Vazio/ausente = local.
  Trocar o modo exige **rebuild**.
- **Projeto:** `BackendStorageAdapter` (`services/storage/backend-adapter.ts`) fala com
  os proxy routes same-origin `/api/editor-storage/projects*`; o proxy
  (`app/api/editor-storage/[...path]/route.ts`, Node) valida a sessão better-auth e
  encaminha pro `${PMZ_CLIPPER_API}/editor/*` com `Authorization: Bearer ${PMZ_SSO_SECRET}`
  + `X-PMZ-User`. Segredo nunca vai ao browser.
- **Mídia:** ao salvar, o `File` é enviado (`POST /api/editor-storage/media`, multipart)
  → MinIO; a `url` retornada é guardada no metadata; ao carregar, `fetch(url)` → `File`.
  Os binários **não** vão pro OPFS no modo backend.
- **Migrations locais:** o runner (`services/storage/migrations/runner.ts`) é **pulado**
  no modo backend (os projetos vêm do servidor já na versão 31).
- Requer `PMZ_SSO_SECRET` setado (o proxy retorna 501 sem ele).

Requisitos do lado do app (backend, server-to-server, auth = `Bearer PMZ_SSO_SECRET`
+ `X-PMZ-User`): `GET/PUT/DELETE /editor/projects/{id}` e `GET /editor/projects`
(projeto = `{id,name,data_json,updated_at}`), `POST /editor/media` (multipart →
`{id,url}`), `GET /editor/media/{id}` → `{url}`. Presigned URLs de mídia precisam de
CORS `GET` a partir de `https://editor.<DOMAIN>`.

Limitação desta fase: o **metadata** de mídia ainda fica local (IndexedDB) — só o
binário é server-persistido. Edição cross-device de um projeto com mídia exige, no
futuro, persistir o metadata no servidor (ex.: embutido no `data_json`).

## Passos no Coolify

1. Novo recurso → **Docker Compose**, apontando para o repo
   `github.com/kellyregis/PMZ_Editor`, branch `main`, arquivo
   `docker-compose.coolify.yml`.
2. Definir as 4 env vars: `DOMAIN`, `OC_DB_PASSWORD`, `OC_SRH_TOKEN`, `OC_AUTH_SECRET`.
3. Configurar o domínio `editor.<DOMAIN>` para o serviço `oc-web` (porta 3000).
4. Deploy. Ordem: `oc-db`/`oc-redis` → `oc-srh` → `oc-migrate` (roda e sai) → `oc-web`.
5. Healthcheck do `oc-web`: `GET /api/health` → `200 OK`.

## Riscos / notas

- **Build pesado:** o stage `builder` roda `next build` (Next 16 + wasm/transformers).
  `oc-migrate` e `oc-web` compartilham as camadas do `builder` (mesmos build-args)
  → um único build por deploy. A pasta `rust/` do repo não entra no build (context
  do Dockerfile copia só `package.json`, `bun.lock`, `turbo.json`, `apps/web/`).
- **Primeiro deploy:** `oc-migrate` precisa do `oc-db` saudável; o `depends_on`
  com healthcheck cobre isso.
- **`wget` nos healthchecks:** presente via busybox no `postgres`/`alpine`/`bun:alpine`.
- **Trocar placeholders depois:** para ligar blog/sons, troque os placeholders por
  chaves reais. `NEXT_PUBLIC_*` exige **rebuild** (são build-time).
