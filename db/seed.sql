-- Explicit local fixture; no Firebase UID is provisioned.
INSERT INTO users(id,handle,display_name,verification_tier) VALUES
('00000000-0000-0000-0000-000000000001','local_one','Local One',1),
('00000000-0000-0000-0000-000000000002','local_two','Local Two',0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO ateliers(id,name,invite_code,capacity,created_by) VALUES
('00000000-0000-0000-0000-000000000010','Local atelier','LOCALM2',2,'00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO atelier_members(atelier_id,user_id,role,slot_index) VALUES
('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','creator',0),
('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002','member',1)
ON CONFLICT DO NOTHING;
