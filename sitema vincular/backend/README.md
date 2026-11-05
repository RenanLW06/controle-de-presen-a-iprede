# API — Gestão de crianças por salas (etapa 3: salas, realocação, frequência, observações, auditoria)

Stack: NestJS + PostgreSQL 16 (TypeScript de ponta a ponta; o banco impõe RLS, auditoria e integridade).

## Rodando localmente
1. Crie o banco e aplique, em ordem, `db/migrations/0001_init.sql` e `0002_hardening.sql` (use um papel dono sem superusuário).
   Defina o fuso do banco, pois "hoje" nas regras de data é `current_date`: `ALTER DATABASE <banco> SET timezone = 'America/Fortaleza';`
2. Crie o papel de login da API: `CREATE ROLE app_login LOGIN PASSWORD '...' IN ROLE app_rw;`
3. `cp .env.example .env`, preencha e carregue as variáveis no shell (a API não lê `.env` sozinha nesta etapa).
4. `npm install && npm run create-admin -- "Nome" email 'senha-12+-caracteres' && npm run dev`

## Endpoints (todos exigem cookie de sessão; métodos que alteram estado exigem `X-Requested-With: fetch`)
| Rota | Quem | Função |
|---|---|---|
| POST /auth/login, /auth/logout | — | Sessão |
| POST /rooms · GET /rooms | admin · admin/monitor | Criar / listar salas (monitor vê só a sua) |
| POST /rooms/:id/monitors | admin | Vincular monitor (encerra o vínculo anterior) |
| POST /children · GET /children | admin · admin/monitor | Cadastrar (com sala inicial) / listar paginado |
| POST /children/:id/move | admin | Realocar (evento de movimentação) |
| GET /children/:id/movements | admin/monitor | Histórico de salas (monitor: só a própria sala) |
| PUT /attendance | admin/monitor | Marcar/corrigir presença (1 por criança/dia; sala derivada da data) |
| GET /rooms/:id/roster?date= | admin/monitor | Lista de chamada da data, paginada |
| POST/GET /children/:id/observations | admin/monitor | Registrar / listar (mais recentes primeiro) |
| DELETE /observations/:id | admin | Exclusão lógica |
| GET /audit | admin | Trilha de auditoria filtrável e paginada |

## Testes
Banco de teste migrado + `DATABASE_URL` (app_login) + `ADMIN_DATABASE_URL` (semeadura) → `npm test`.
Sem configurar nada além das duas URLs: `npm test` (21 testes). Cobrem escopo do monitor no banco e na API, papéis por rota, CSRF,
bloqueio de login, paginação, frequência (1 por dia, correção), realocação (histórico, troca de acesso, datas, conflitos),
observações, auditoria (autor, append-only, acesso só admin) e mapeamento de erros.
Rode também com um dono de tabelas **sem** superusuário: superusuário ignora o RLS e pode esconder falhas.

## Variáveis de ambiente
| Variável | Uso |
|---|---|
| DATABASE_URL | Conexão da API (papel sem BYPASSRLS, sem DELETE) |
| ADMIN_DATABASE_URL | Migrações, seed e testes; nunca usada pela API |
| JWT_SECRET | ≥ 32 caracteres; a API não inicia sem ele |
| COOKIE_SECURE | `true` em produção (HTTPS) |
| DB_POOL_MAX | Tamanho do pool (padrão 20) |
| PORT | Porta HTTP (padrão 3000) |

## Decisões de segurança
- Senhas com Argon2id; bloqueio de 15 min após 5 falhas; mensagem de erro única; hash verificado mesmo sem usuário.
- JWT de 15 min em cookie httpOnly + SameSite=Strict; CSRF reforçado por cabeçalho `X-Requested-With: fetch` em métodos que alteram estado.
- Autorização em duas camadas: `RolesGuard` na rota (negar por padrão) e RLS no banco (escopo por sala).
- Contexto do usuário via `set_config(..., true)` dentro de transação: não vaza entre conexões do pool.

## Decisões em aberto (padrões adotados)
- Monitor da nova sala **não** vê o histórico da sala anterior (observações e presenças ficam na sala em que nasceram).
- Monitor pode corrigir presenças da própria sala sem limite de prazo; se a empresa quiser uma janela (ex.: 7 dias), é uma regra a acrescentar.
- A realocação não aceita data futura nem data com presenças já registradas na sala atual a partir dela.
- Ainda sem limite de requisições por IP (só bloqueio por conta) e sem recuperação/troca de senha.
