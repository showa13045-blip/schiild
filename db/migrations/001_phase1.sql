-- PostgreSQL 16. Migration account owns schema; application uses schiild_app.
CREATE FUNCTION to_schiild_date(ts timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT (ts AT TIME ZONE 'UTC')::date $$;

CREATE TABLE users (
  id uuid PRIMARY KEY, firebase_uid text UNIQUE,
  handle text UNIQUE NOT NULL, display_name text NOT NULL, avatar_url text,
  timezone text NOT NULL DEFAULT 'Asia/Tokyo',
  verification_tier smallint NOT NULL DEFAULT 0 CHECK (verification_tier IN (0,1)),
  streak_count integer NOT NULL DEFAULT 0 CHECK (streak_count >= 0),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE ateliers (
  id uuid PRIMARY KEY, name text NOT NULL, invite_code text UNIQUE NOT NULL,
  capacity integer NOT NULL CHECK (capacity IN (2,5,12,20)),
  render_tier text NOT NULL DEFAULT 'bsp_128' CHECK (render_tier = 'bsp_128'),
  palette_id text NOT NULL DEFAULT 'schiild_32',
  cover_schiild_id uuid, cover_set_by uuid REFERENCES users(id), cover_set_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE TABLE atelier_members (
  atelier_id uuid NOT NULL REFERENCES ateliers(id), user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('creator','moderator','member')),
  slot_index integer NOT NULL CHECK (slot_index >= 0),
  joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
  PRIMARY KEY (atelier_id,user_id)
);
CREATE UNIQUE INDEX active_atelier_slots ON atelier_members(atelier_id,slot_index) WHERE left_at IS NULL;
CREATE TABLE schiils (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  schiild_date date NOT NULL, image_key text NOT NULL,
  image_sha256 text NOT NULL CHECK (image_sha256 ~ '^[0-9a-f]{64}$'), caption text,
  moderation_state text NOT NULL DEFAULT 'pending' CHECK (moderation_state IN ('pending','approved','rejected')),
  removed_at timestamptz, removal_reason text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,schiild_date), UNIQUE (id,user_id,schiild_date),
  CHECK (schiild_date = to_schiild_date(created_at))
);
CREATE TABLE schiil_posts (
  id uuid PRIMARY KEY, schiil_id uuid NOT NULL,
  atelier_id uuid NOT NULL, user_id uuid NOT NULL, schiild_date date NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (schiil_id,user_id,schiild_date) REFERENCES schiils(id,user_id,schiild_date),
  FOREIGN KEY (atelier_id,user_id) REFERENCES atelier_members(atelier_id,user_id),
  UNIQUE (atelier_id,user_id,schiild_date),
  CHECK (schiild_date = to_schiild_date(posted_at))
);
CREATE TABLE schiilds (
  id uuid PRIMARY KEY, atelier_id uuid REFERENCES ateliers(id),
  kind text NOT NULL CHECK (kind IN ('atelier','global')), schiild_date date NOT NULL,
  schiild_index integer NOT NULL CHECK (schiild_index > 0),
  participant_count integer NOT NULL CHECK (participant_count >= 0),
  capacity_at_gen integer NOT NULL CHECK (capacity_at_gen > 0),
  fill_rate numeric(5,4) NOT NULL CHECK (fill_rate BETWEEN 0 AND 1),
  algorithm_version text NOT NULL, generation_seed text NOT NULL CHECK (generation_seed ~ '^[0-9a-f]{64}$'),
  lottery_seed text NOT NULL CHECK (lottery_seed ~ '^[0-9a-f]{64}$'),
  lottery_order jsonb NOT NULL CHECK (jsonb_typeof(lottery_order) = 'array'),
  palette_id text NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  image_key text NOT NULL, thumbnail_key text NOT NULL, region_map jsonb NOT NULL, metadata jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (atelier_id,schiild_date),
  UNIQUE (id,atelier_id),
  CHECK ((kind = 'global') = (atelier_id IS NULL)),
  CHECK (participant_count <= capacity_at_gen)
);
ALTER TABLE ateliers ADD FOREIGN KEY (cover_schiild_id,id) REFERENCES schiilds(id,atelier_id);
CREATE TABLE schiild_custody (
  schiild_id uuid PRIMARY KEY REFERENCES schiilds(id),
  custodian_user_id uuid REFERENCES users(id), lottery_rank integer CHECK (lottery_rank >= 0),
  assigned_at timestamptz NOT NULL DEFAULT now(), declined_count integer NOT NULL DEFAULT 0 CHECK (declined_count >= 0)
);
CREATE TABLE schiild_custody_events (
  id bigserial PRIMARY KEY, schiild_id uuid NOT NULL REFERENCES schiilds(id),
  event_type text NOT NULL CHECK (event_type IN ('assigned','declined','promoted','returned')),
  user_id uuid REFERENCES users(id), lottery_rank integer CHECK (lottery_rank >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE schiild_revisions (
  id uuid PRIMARY KEY, schiild_id uuid NOT NULL REFERENCES schiilds(id),
  revision integer NOT NULL CHECK (revision > 0), image_key text,
  input_set_hash text NOT NULL CHECK (input_set_hash ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL, dispute_open boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), purge_after timestamptz NOT NULL,
  purged_at timestamptz, UNIQUE (schiild_id,revision)
);
-- Normalize removed_schiil_ids UUID[] so every reference has an enforced FK.
CREATE TABLE schiild_revision_removals (
  revision_id uuid NOT NULL REFERENCES schiild_revisions(id),
  schiil_id uuid NOT NULL REFERENCES schiils(id), PRIMARY KEY (revision_id,schiil_id)
);
CREATE FUNCTION protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'history rows cannot be removed or rewritten' USING ERRCODE = '42501'; END $$;
CREATE TRIGGER custody_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON schiild_custody_events
FOR EACH STATEMENT EXECUTE FUNCTION protect_history();
CREATE TRIGGER revisions_no_delete BEFORE DELETE OR TRUNCATE ON schiild_revisions
FOR EACH STATEMENT EXECUTE FUNCTION protect_history();
CREATE TRIGGER revision_removals_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON schiild_revision_removals
FOR EACH STATEMENT EXECUTE FUNCTION protect_history();

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'schiild_app') THEN CREATE ROLE schiild_app NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO schiild_app;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO schiild_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO schiild_app;
REVOKE DELETE,TRUNCATE ON ALL TABLES IN SCHEMA public FROM schiild_app;
REVOKE UPDATE ON schiild_custody_events,schiild_revision_removals FROM schiild_app;
