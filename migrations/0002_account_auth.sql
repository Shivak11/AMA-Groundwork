PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK (password_iterations>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS browser_sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS browser_sessions_user ON browser_sessions(user_id,expires_at);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_authorization_requests (
  request_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  state TEXT,
  code_challenge TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at TEXT,
  exchange_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  exchange_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expiry ON oauth_authorization_codes(expires_at);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_user ON oauth_access_tokens(user_id,expires_at);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_family ON oauth_access_tokens(family_id);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  exchange_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_family ON oauth_refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_user ON oauth_refresh_tokens(user_id,expires_at);

CREATE TABLE IF NOT EXISTS oauth_consents (
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id,client_id,scope)
);

ALTER TABLE workshop_sessions ADD COLUMN owner_user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE workshop_sessions ADD COLUMN account_reference TEXT;
ALTER TABLE workshop_sessions ADD COLUMN account_read_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS workshop_sessions_account_reference ON workshop_sessions(account_reference) WHERE account_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workshop_sessions_account_read_hash ON workshop_sessions(account_read_hash) WHERE account_read_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS workshop_sessions_owner ON workshop_sessions(owner_user_id,updated_at DESC);
