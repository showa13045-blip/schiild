ALTER TABLE schiils ADD COLUMN bucket_mean double precision[];
ALTER TABLE schiils ADD CONSTRAINT bucket_mean_dimensions CHECK (bucket_mean IS NULL OR array_length(bucket_mean,1)=3);
CREATE TABLE generation_jobs (
  job_key text PRIMARY KEY, atelier_id uuid REFERENCES ateliers(id), schiild_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
  attempts integer NOT NULL DEFAULT 0, error_code text, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (atelier_id,schiild_date)
);
CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), schiild_date date NOT NULL,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
  UNIQUE(user_id,schiild_date)
);
CREATE TABLE push_devices (
  user_id uuid NOT NULL REFERENCES users(id), token text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true
);
GRANT SELECT,INSERT,UPDATE ON generation_jobs,notification_outbox,push_devices TO schiild_app;
