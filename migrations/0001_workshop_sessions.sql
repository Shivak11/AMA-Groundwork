PRAGMA foreign_keys = ON;

-- This conservative admission counter is not a physical SQLite file-size meter.
-- It includes both head and snapshot UTF-8 JSON bytes, plus per-row allowances.
-- No workbook, snapshot or receipt is automatically removed to make room.
CREATE TABLE IF NOT EXISTS workshop_storage_budget (
  id INTEGER PRIMARY KEY CHECK (id=1),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes>=0),
  limit_bytes INTEGER NOT NULL DEFAULT 200000000 CHECK (limit_bytes>0)
);
INSERT OR IGNORE INTO workshop_storage_budget(id) VALUES(1);

CREATE TABLE IF NOT EXISTS workshop_sessions (
  session_id TEXT PRIMARY KEY,
  write_hash TEXT NOT NULL UNIQUE,
  read_hash TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','active')),
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  current_record TEXT,
  activation_hash TEXT,
  preference TEXT NOT NULL DEFAULT 'auto' CHECK (preference IN ('auto','text')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  operation_id TEXT,
  operation_hash TEXT,
  operation_expected INTEGER,
  CHECK ((state='pending' AND current_record IS NULL AND activation_hash IS NULL AND current_revision=0)
      OR (state='active' AND current_record IS NOT NULL AND activation_hash IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS workshop_revisions (
  session_id TEXT NOT NULL REFERENCES workshop_sessions(session_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id,revision)
);

CREATE TABLE IF NOT EXISTS workshop_operations (
  session_id TEXT NOT NULL REFERENCES workshop_sessions(session_id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  operation_hash TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  applied_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id,operation_id)
);

CREATE TABLE IF NOT EXISTS workshop_file_tickets (
  ticket_hash TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pdf','json')),
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id,revision) REFERENCES workshop_revisions(session_id,revision) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS workshop_file_tickets_session ON workshop_file_tickets(session_id,revision);

CREATE TRIGGER IF NOT EXISTS workshop_snapshot_after_change
AFTER UPDATE OF state,current_revision,current_record ON workshop_sessions
WHEN NEW.state='active' AND (OLD.state='pending' OR NEW.current_revision<>OLD.current_revision)
BEGIN
  INSERT INTO workshop_revisions(session_id,revision,record_json,created_at)
  VALUES(NEW.session_id,NEW.current_revision,NEW.current_record,NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS workshop_receipt_after_operation
AFTER UPDATE OF operation_id ON workshop_sessions
WHEN NEW.operation_id IS NOT NULL AND (OLD.operation_id IS NULL OR NEW.operation_id<>OLD.operation_id)
BEGIN
  INSERT INTO workshop_operations(session_id,operation_id,operation_hash,expected_revision,applied_revision,created_at)
  VALUES(NEW.session_id,NEW.operation_id,NEW.operation_hash,NEW.operation_expected,NEW.current_revision,NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS workshop_revisions_immutable
BEFORE UPDATE ON workshop_revisions BEGIN SELECT RAISE(ABORT,'Immutable workshop revision'); END;
CREATE TRIGGER IF NOT EXISTS workshop_operations_immutable
BEFORE UPDATE ON workshop_operations BEGIN SELECT RAISE(ABORT,'Immutable operation receipt'); END;

CREATE TRIGGER IF NOT EXISTS workshop_receipt_admission
BEFORE INSERT ON workshop_operations
WHEN (SELECT count(*) FROM workshop_operations WHERE session_id=NEW.session_id)>=2000
BEGIN SELECT RAISE(ABORT,'WORKSHOP_RECEIPT_LIMIT'); END;

CREATE TRIGGER IF NOT EXISTS workshop_session_budget_insert
AFTER INSERT ON workshop_sessions
BEGIN
  UPDATE workshop_storage_budget SET used_bytes=used_bytes+4096+coalesce(length(CAST(NEW.current_record AS BLOB)),0)
    WHERE id=1 AND used_bytes+4096+coalesce(length(CAST(NEW.current_record AS BLOB)),0)<=limit_bytes;
  SELECT CASE WHEN changes()=0 THEN RAISE(ABORT,'WORKSHOP_STORAGE_LIMIT') END;
END;
CREATE TRIGGER IF NOT EXISTS workshop_session_budget_update
AFTER UPDATE OF current_record ON workshop_sessions
BEGIN
  UPDATE workshop_storage_budget SET used_bytes=used_bytes+coalesce(length(CAST(NEW.current_record AS BLOB)),0)-coalesce(length(CAST(OLD.current_record AS BLOB)),0)
    WHERE id=1 AND used_bytes+coalesce(length(CAST(NEW.current_record AS BLOB)),0)-coalesce(length(CAST(OLD.current_record AS BLOB)),0)<=limit_bytes;
  SELECT CASE WHEN changes()=0 THEN RAISE(ABORT,'WORKSHOP_STORAGE_LIMIT') END;
END;
CREATE TRIGGER IF NOT EXISTS workshop_session_budget_delete
AFTER DELETE ON workshop_sessions
BEGIN UPDATE workshop_storage_budget SET used_bytes=used_bytes-4096-coalesce(length(CAST(OLD.current_record AS BLOB)),0) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS workshop_snapshot_budget_insert
AFTER INSERT ON workshop_revisions
BEGIN
  UPDATE workshop_storage_budget SET used_bytes=used_bytes+4096+length(CAST(NEW.record_json AS BLOB))
    WHERE id=1 AND used_bytes+4096+length(CAST(NEW.record_json AS BLOB))<=limit_bytes;
  SELECT CASE WHEN changes()=0 THEN RAISE(ABORT,'WORKSHOP_STORAGE_LIMIT') END;
END;
CREATE TRIGGER IF NOT EXISTS workshop_snapshot_budget_delete
AFTER DELETE ON workshop_revisions
BEGIN UPDATE workshop_storage_budget SET used_bytes=used_bytes-4096-length(CAST(OLD.record_json AS BLOB)) WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS workshop_receipt_budget_insert
AFTER INSERT ON workshop_operations
BEGIN
  UPDATE workshop_storage_budget SET used_bytes=used_bytes+2048 WHERE id=1 AND used_bytes+2048<=limit_bytes;
  SELECT CASE WHEN changes()=0 THEN RAISE(ABORT,'WORKSHOP_STORAGE_LIMIT') END;
END;
CREATE TRIGGER IF NOT EXISTS workshop_receipt_budget_delete
AFTER DELETE ON workshop_operations
BEGIN UPDATE workshop_storage_budget SET used_bytes=used_bytes-2048 WHERE id=1; END;

CREATE TRIGGER IF NOT EXISTS workshop_ticket_budget_insert
AFTER INSERT ON workshop_file_tickets
BEGIN
  UPDATE workshop_storage_budget SET used_bytes=used_bytes+2048 WHERE id=1 AND used_bytes+2048<=limit_bytes;
  SELECT CASE WHEN changes()=0 THEN RAISE(ABORT,'WORKSHOP_STORAGE_LIMIT') END;
END;
CREATE TRIGGER IF NOT EXISTS workshop_ticket_budget_delete
AFTER DELETE ON workshop_file_tickets
BEGIN UPDATE workshop_storage_budget SET used_bytes=used_bytes-2048 WHERE id=1; END;
