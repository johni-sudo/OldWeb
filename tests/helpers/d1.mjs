import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Small D1-compatible adapter over Node's built-in SQLite.
 * It is used only by local integration tests and the preview server.
 */
export class LocalD1Database {
  constructor(filename = ':memory:') {
    if (filename !== ':memory:') {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
    }
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
  }

  prepare(query) {
    return new LocalD1Prepared(this, query, []);
  }

  exec(query) {
    this.db.exec(query);
    return { count: 0, duration: 0 };
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      if (!(statement instanceof LocalD1Prepared)) {
        throw new TypeError('batch() expects prepared statements');
      }
      const isSelect = /^\s*(select|with|pragma)\b/i.test(statement.query);
      results.push(isSelect ? await statement.all() : await statement.run());
    }
    return results;
  }

  close() {
    this.db.close();
  }
}

class LocalD1Prepared {
  constructor(database, query, params) {
    this.database = database;
    this.query = query;
    this.params = params;
  }

  bind(...params) {
    return new LocalD1Prepared(this.database, this.query, params);
  }

  async first(column) {
    const statement = this.database.db.prepare(this.query);
    const row = statement.get(...this.params);
    if (!row) return null;
    if (column) return row[column] ?? null;
    return { ...row };
  }

  async all() {
    const statement = this.database.db.prepare(this.query);
    const rows = statement.all(...this.params).map((row) => ({ ...row }));
    return {
      success: true,
      results: rows,
      meta: { duration: 0, changes: 0, last_row_id: 0, rows_read: rows.length, rows_written: 0 },
    };
  }

  async run() {
    const statement = this.database.db.prepare(this.query);
    const info = statement.run(...this.params);
    return {
      success: true,
      results: [],
      meta: {
        duration: 0,
        changes: Number(info.changes || 0),
        last_row_id: Number(info.lastInsertRowid || 0),
        rows_read: 0,
        rows_written: Number(info.changes || 0),
      },
    };
  }
}

export function applyMigrations(db, migrationsDir) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.db.exec(sql);
  }
}

export function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
