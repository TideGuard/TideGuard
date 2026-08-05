/**
 * SQLite schema migrations for QueueRoom Durable Object storage.
 */

export type MetaAccess = {
  getMeta: (key: string) => string | null;
  setMeta: (key: string, value: string) => void;
};

export type MigrateDeps = MetaAccess & {
  sql: SqlStorage;
  reconcileDepth: () => void;
};

/** Apply pending schema versions. Idempotent; safe to call on every DO wake. */
export function migrateQueueRoomSchema(deps: MigrateDeps): void {
  const { sql, getMeta, setMeta, reconcileDepth } = deps;

  sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

  let version = Number(getMeta("schema_version") ?? "0");
  if (version < 1) {
    sql.exec(`
        CREATE TABLE IF NOT EXISTS visitors (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          joined_at INTEGER NOT NULL,
          last_heartbeat_at INTEGER NOT NULL,
          admitted_at INTEGER,
          sequence INTEGER NOT NULL,
          entered INTEGER NOT NULL DEFAULT 1
        )
      `);
    sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_visitors_status_sequence
          ON visitors (status, sequence)
      `);
    version = 2;
    setMeta("schema_version", "2");
  } else if (version < 2) {
    sql.exec(`
        ALTER TABLE visitors ADD COLUMN entered INTEGER NOT NULL DEFAULT 1
      `);
    version = 2;
    setMeta("schema_version", "2");
  }

  if (version < 3) {
    reconcileDepth();
    setMeta("schema_version", "3");
    version = 3;
  }

  if (version < 4) {
    sql.exec(`
        CREATE TABLE IF NOT EXISTS traffic_buckets (
          t INTEGER PRIMARY KEY,
          joins INTEGER NOT NULL DEFAULT 0,
          admits INTEGER NOT NULL DEFAULT 0,
          max_outflow REAL NOT NULL DEFAULT 0,
          waiting INTEGER NOT NULL DEFAULT 0,
          entered INTEGER NOT NULL DEFAULT 0
        )
      `);
    setMeta("schema_version", "4");
    version = 4;
  }

  if (version < 5) {
    sql.exec(`
        ALTER TABLE visitors ADD COLUMN next_check_at INTEGER
      `);
    setMeta("schema_version", "5");
    version = 5;
  }
}
