-- 0002_hardening.sql
-- 1) FORCE RLS removido: as funções SECURITY DEFINER rodam como dono das tabelas e precisam ler
--    sem as policies (que são TO app_rw). O papel da API não é dono, então o RLS continua valendo para ele.
-- 2) audit_log: leitura só para administrador (a escrita continua exclusiva dos triggers).
-- 3) Presença: trava a permanência com FOR SHARE, serializando com uma realocação concorrente.
-- 4) Índice para consultas "quem estava na sala X na data Y".
BEGIN;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['rooms','children','room_monitors','child_room_movements','attendance','observations'] LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_admin_select ON audit_log FOR SELECT TO app_rw USING (app_is_admin());

CREATE OR REPLACE FUNCTION attendance_room_check() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM child_room_movements m
    WHERE m.child_id = NEW.child_id AND m.to_room_id = NEW.room_id
      AND m.started_on <= NEW.attendance_date
      AND (m.ended_on IS NULL OR NEW.attendance_date < m.ended_on)
    FOR SHARE OF m
  ) THEN RAISE EXCEPTION 'criança não estava nesta sala em %', NEW.attendance_date; END IF;
  RETURN NEW;
END $$;

CREATE INDEX movements_room_period_idx ON child_room_movements (to_room_id, started_on);
COMMIT;
