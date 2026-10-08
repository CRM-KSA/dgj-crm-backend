CREATE TABLE IF NOT EXISTS crm_members (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('manager','member')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_records (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('Contacts','Opportunities','Meetings','Reports','Complaints','Tasks')),
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared','private')),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  CHECK (visibility <> 'private' OR type IN ('Contacts','Opportunities'))
);
CREATE INDEX IF NOT EXISTS crm_records_type_time ON crm_records(type,updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_records_owner ON crm_records(owner_id);

CREATE TABLE IF NOT EXISTS crm_links (
  child_id UUID NOT NULL REFERENCES crm_records(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES crm_records(id) ON DELETE RESTRICT,
  PRIMARY KEY (child_id,parent_id),
  CHECK (child_id <> parent_id)
);
CREATE INDEX IF NOT EXISTS crm_links_parent ON crm_links(parent_id);

CREATE TABLE IF NOT EXISTS crm_create_requests (
  actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  request_key UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  record_id UUID NOT NULL,
  PRIMARY KEY (actor_id,request_key)
);

CREATE TABLE IF NOT EXISTS crm_audit (
  id UUID PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  record_id UUID,
  record_type TEXT,
  policy JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_audit_time ON crm_audit(created_at DESC);

CREATE TABLE IF NOT EXISTS crm_preferences (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE RESTRICT,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

