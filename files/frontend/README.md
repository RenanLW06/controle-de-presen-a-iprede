# Web — Gestão de crianças por salas (etapa 1 do frontend)

Next.js 14 (App Router) + TypeScript, CSS puro com tokens (`app/globals.css`), fontes autohospedadas (`@fontsource`, sem chamadas a terceiros).
Paleta: branco dominante, laranja para ações, vermelho para falta/erro.

## Rodando localmente
1. API em outra porta: no `backend`, `PORT=3001` e `COOKIE_SECURE=false` (somente em desenvolvimento, sem HTTPS).
2. `cp .env.example .env` (ajuste `API_URL` se necessário) e `npm install && npm run dev` → http://localhost:3000
3. Entre com o administrador criado por `npm run create-admin` no backend.

O navegador só conversa com este servidor: `/api/*` é repassado à API (`next.config.js`), então o cookie de sessão
(httpOnly, SameSite=Strict) funciona sem CORS. Em produção, `API_URL` aponta para a API interna e tudo roda sob HTTPS.

## Telas desta etapa
| Rota | Quem | O que faz |
|---|---|---|
| /login | todos | Entrada; mensagens de erro claras e aviso do bloqueio por tentativas |
| /chamada | admin, monitor | Chamada por sala e data (Presente/Falta, justificativa, salva na hora, paginada) |
| /criancas | admin, monitor | Lista paginada; admin cadastra criança com sala inicial |
| /salas | admin | Lista e cria salas |

O monitor só vê a própria sala porque a API (RLS) só devolve os dados dela; a interface não filtra nada por conta própria.

## Próximas telas sugeridas
Realocação de criança (com data e motivo), ficha da criança (observações e histórico de salas), vínculo de monitores,
importação de planilha e consulta de auditoria. O nome do produto está em `lib/config.ts` (provisório).
