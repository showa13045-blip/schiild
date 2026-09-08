ALTER TABLE schiils ADD COLUMN moderation_reason text CHECK (moderation_reason IN ('person','other'));
CREATE TABLE moderation_outbox (
  schiil_id uuid PRIMARY KEY REFERENCES schiils(id), user_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (reason IN ('person','other')),
  created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz
);
GRANT SELECT,INSERT,UPDATE ON moderation_outbox TO schiild_app;
