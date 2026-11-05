-- 0001_init.sql — PostgreSQL 16
-- Gestão de crianças por salas: esquema, movimentação, auditoria append-only e RLS.
-- A API conecta com o papel app_rw (sem DELETE, sem BYPASSRLS) e, a cada transação,
-- executa: SET LOCAL app.user_id = '<uuid>'; SET LOCAL app.request_id = '<id>';
BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role         AS ENUM ('admin', 'monitor');
CREATE TYPE attendance_status AS ENUM ('present', 'absent');
CREATE TYPE import_status     AS ENUM ('queued', 'processing', 'completed', 'completed_with_errors', 'failed');

-- ───────────── Tabelas ─────────────
CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  email                citext NOT NULL,
  password_hash        text NOT NULL,                 -- Argon2id, nunca texto puro
  role                 user_role NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  failed_logins        int NOT NULL DEFAULT 0,
  locked_until         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE UNIQUE INDEX users_email_uq ON users (email) WHERE deleted_at IS NULL;

CREATE TABLE rooms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX rooms_name_uq ON rooms (lower(name)) WHERE deleted_at IS NULL;

-- Dados mínimos da criança (minimização). Responsáveis/contatos: fora do escopo (sugestão).
CREATE TABLE children (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL,
  birth_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX children_name_idx ON children (full_name) WHERE deleted_at IS NULL;

-- Vínculo monitor↔sala com período; um monitor em uma sala por vez.
CREATE TABLE room_monitors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES rooms(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  started_on  date NOT NULL,
  ended_on    date,                                   -- fim exclusivo
  assigned_by uuid NOT NULL REFERENCES users(id),
  CHECK (ended_on IS NULL OR ended_on > started_on),
  EXCLUDE USING gist (user_id WITH =, daterange(started_on, ended_on, '[)') WITH &&)
);
CREATE INDEX room_monitors_room_idx ON room_monitors (room_id);

-- Movimentação como evento próprio. Cada linha = uma permanência na sala de destino.
-- Período [started_on, ended_on): ended_on é o dia da mudança (1º dia na nova sala).
CREATE TABLE child_room_movements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     uuid NOT NULL REFERENCES children(id),
  from_room_id uuid REFERENCES rooms(id),             -- NULL na alocação inicial
  to_room_id   uuid NOT NULL REFERENCES rooms(id),
  started_on   date NOT NULL,
  ended_on     date,
  moved_by     uuid NOT NULL REFERENCES users(id),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR ended_on > started_on),
  CHECK (from_room_id IS DISTINCT FROM to_room_id),
  EXCLUDE USING gist (child_id WITH =, daterange(started_on, ended_on, '[)') WITH &&)
);
CREATE UNIQUE INDEX movements_one_open_uq ON child_room_movements (child_id) WHERE ended_on IS NULL;
CREATE INDEX movements_room_open_idx ON child_room_movements (to_room_id) WHERE ended_on IS NULL;

-- Frequência: uma marcação por criança por dia; room_id = sala vigente na data (histórico preservado).
CREATE TABLE attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id),
  room_id         uuid NOT NULL REFERENCES rooms(id),
  attendance_date date NOT NULL,
  status          attendance_status NOT NULL,
  justification   text,
  marked_by       uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, attendance_date),
  CHECK (status = 'absent' OR justification IS NULL),
  CHECK (justification IS NULL OR length(justification) <= 1000)
);
CREATE INDEX attendance_room_date_idx ON attendance (room_id, attendance_date);

-- Observações: vinculadas à criança E à sala em que foram escritas. Sem edição; correção = exclusão lógica (admin).
CREATE TABLE observations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id   uuid NOT NULL REFERENCES children(id),
  room_id    uuid NOT NULL REFERENCES rooms(id),
  author_id  uuid NOT NULL REFERENCES users(id),
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id)
);
CREATE INDEX observations_child_idx ON observations (child_id, created_at DESC);
CREATE INDEX observations_room_idx  ON observations (room_id, created_at DESC);

-- Importação em massa (processada em lotes por worker; erros por linha sem abortar o job).
CREATE TABLE import_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     uuid NOT NULL REFERENCES users(id),
  file_name      text NOT NULL,
  file_sha256    text NOT NULL,
  status         import_status NOT NULL DEFAULT 'queued',
  total_rows     int NOT NULL DEFAULT 0,
  imported_rows  int NOT NULL DEFAULT 0,
  failed_rows    int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);
CREATE TABLE import_row_errors (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     uuid NOT NULL REFERENCES import_jobs(id),
  row_number int NOT NULL,
  field      text,
  message    text NOT NULL
);
CREATE INDEX import_errors_job_idx ON import_row_errors (job_id, row_number);

-- ───────────── Auditoria append-only ─────────────
CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  action      text NOT NULL,                         -- create | update | soft_delete | hard_delete
  entity_type text NOT NULL,
  entity_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  request_id  text
);
CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_actor_idx  ON audit_log (actor_id, occurred_at DESC);

CREATE FUNCTION audit_forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log é append-only'; END $$;
CREATE TRIGGER audit_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_forbid_change();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_forbid_change();

-- Auditoria no próprio banco: nenhuma escrita escapa, mesmo por bug na aplicação.
CREATE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb; v_new jsonb; v_action text; v_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - 'password_hash'; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - 'password_hash'; END IF;
  v_id := COALESCE((v_new ->> 'id'), (v_old ->> 'id'))::uuid;
  v_action := CASE
    WHEN TG_OP = 'INSERT' THEN 'create'
    WHEN TG_OP = 'DELETE' THEN 'hard_delete'
    WHEN v_old ->> 'deleted_at' IS NULL AND v_new ->> 'deleted_at' IS NOT NULL THEN 'soft_delete'
    ELSE 'update' END;
  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, old_values, new_values, request_id)
  VALUES (NULLIF(current_setting('app.user_id', true), '')::uuid, v_action, TG_TABLE_NAME, v_id,
          v_old, v_new, NULLIF(current_setting('app.request_id', true), ''));
  RETURN NULL;
END $$;

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','rooms','children','room_monitors','child_room_movements','attendance','observations'] LOOP
    EXECUTE format('CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row()', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['users','rooms','children','attendance'] LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ───────────── Integridade da movimentação e da frequência ─────────────
-- Movimentação é imutável: só é permitido fechar a permanência (ended_on NULL → data).
CREATE FUNCTION movements_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'child_room_movements é imutável: exclusão proibida'; END IF;
  IF OLD.ended_on IS NOT NULL OR (to_jsonb(NEW) - 'ended_on') <> (to_jsonb(OLD) - 'ended_on') THEN
    RAISE EXCEPTION 'child_room_movements é imutável: só é permitido fechar a permanência';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER movements_guard BEFORE UPDATE OR DELETE ON child_room_movements
  FOR EACH ROW EXECUTE FUNCTION movements_guard();

-- A presença só pode ser marcada na sala em que a criança estava naquela data.
CREATE FUNCTION attendance_room_check() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM child_room_movements m
    WHERE m.child_id = NEW.child_id AND m.to_room_id = NEW.room_id
      AND m.started_on <= NEW.attendance_date
      AND (m.ended_on IS NULL OR NEW.attendance_date < m.ended_on)
  ) THEN RAISE EXCEPTION 'criança não estava nesta sala em %', NEW.attendance_date; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attendance_room_check BEFORE INSERT OR UPDATE OF child_id, room_id, attendance_date ON attendance
  FOR EACH ROW EXECUTE FUNCTION attendance_room_check();

-- ───────────── Permissões e RLS (defesa em profundidade) ─────────────
-- Funções SECURITY DEFINER: o papel vem do banco, nunca de uma claim enviada pela sessão.
CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM users WHERE id = app_user_id() AND role = 'admin' AND is_active AND deleted_at IS NULL) $$;

CREATE FUNCTION monitor_room_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT rm.room_id FROM room_monitors rm JOIN users u ON u.id = rm.user_id
   WHERE rm.user_id = app_user_id() AND u.is_active AND u.deleted_at IS NULL AND u.role = 'monitor'
     AND rm.started_on <= current_date AND (rm.ended_on IS NULL OR current_date < rm.ended_on) $$;

CREATE FUNCTION monitor_child_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT m.child_id FROM child_room_movements m
   WHERE m.ended_on IS NULL AND m.to_room_id IN (SELECT monitor_room_ids()) $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw') THEN CREATE ROLE app_rw NOLOGIN; END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON users, rooms, children, room_monitors, child_room_movements,
      attendance, observations, import_jobs, import_row_errors TO app_rw;   -- sem DELETE
GRANT SELECT ON audit_log TO app_rw;                                         -- escrita só via trigger
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_rw;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['rooms','children','room_monitors','child_room_movements','attendance','observations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_admin ON %I FOR ALL TO app_rw USING (app_is_admin()) WITH CHECK (app_is_admin())', t, t);
  END LOOP;
END $$;

-- Monitor: leitura restrita à própria sala
CREATE POLICY rooms_monitor_select ON rooms FOR SELECT TO app_rw USING (id IN (SELECT monitor_room_ids()));
CREATE POLICY room_monitors_self    ON room_monitors FOR SELECT TO app_rw USING (user_id = app_user_id());
CREATE POLICY children_monitor_select ON children FOR SELECT TO app_rw
  USING (deleted_at IS NULL AND id IN (SELECT monitor_child_ids()));
CREATE POLICY movements_monitor_select ON child_room_movements FOR SELECT TO app_rw
  USING (to_room_id IN (SELECT monitor_room_ids()));

-- Monitor: presença na própria sala
CREATE POLICY attendance_monitor_select ON attendance FOR SELECT TO app_rw
  USING (room_id IN (SELECT monitor_room_ids()));
CREATE POLICY attendance_monitor_insert ON attendance FOR INSERT TO app_rw
  WITH CHECK (room_id IN (SELECT monitor_room_ids()) AND marked_by = app_user_id()
              AND child_id IN (SELECT monitor_child_ids()));
CREATE POLICY attendance_monitor_update ON attendance FOR UPDATE TO app_rw
  USING (room_id IN (SELECT monitor_room_ids()))
  WITH CHECK (room_id IN (SELECT monitor_room_ids()) AND marked_by = app_user_id());

-- Monitor: observações da própria sala (somente leitura e inclusão)
CREATE POLICY observations_monitor_select ON observations FOR SELECT TO app_rw
  USING (deleted_at IS NULL AND room_id IN (SELECT monitor_room_ids()));
CREATE POLICY observations_monitor_insert ON observations FOR INSERT TO app_rw
  WITH CHECK (room_id IN (SELECT monitor_room_ids()) AND author_id = app_user_id()
              AND child_id IN (SELECT monitor_child_ids()));

COMMIT;
