import { describe, it, expect, afterEach } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { resolveDbFile } from '../src/dbPath';

const dir = () => mkdtempSync(join(tmpdir(), 'pinion-dbpath-'));
const open: Database.Database[] = [];
afterEach(() => { while (open.length) open.pop()!.close(); });

/** An old-style database with one note in it, left open when `keepOpen` is true. */
function oldDb(file: string, keepOpen = false): Database.Database {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('wal_autocheckpoint = 0');
  db.exec("CREATE TABLE notes (text TEXT); INSERT INTO notes VALUES ('my chats')");
  if (keepOpen) open.push(db);
  else db.close();
  return db;
}

const notes = (file: string) => {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare('SELECT text FROM notes').pluck().all();
  } finally {
    db.close();
  }
};

describe('resolveDbFile', () => {
  it('uses data/pinion.db on a fresh install', () => {
    const d = dir();
    expect(resolveDbFile({}, d)).toBe(join(d, 'pinion.db'));
    expect(existsSync(join(d, 'pinion.db'))).toBe(false);
  });

  it('moves an old openchat.db', () => {
    const d = dir();
    oldDb(join(d, 'openchat.db'));
    expect(resolveDbFile({}, d)).toBe(join(d, 'pinion.db'));
    expect(notes(join(d, 'pinion.db'))).toEqual(['my chats']);
    expect(existsSync(join(d, 'openchat.db'))).toBe(false);
  });

  it('moves an unclean database with its WAL', () => {
    const src = dir();
    oldDb(join(src, 'openchat.db'), true);
    const d = dir();
    // A copy taken while it was open is what a crash or power cut leaves behind: the note is only in the WAL.
    copyFileSync(join(src, 'openchat.db'), join(d, 'openchat.db'));
    copyFileSync(join(src, 'openchat.db-wal'), join(d, 'openchat.db-wal'));
    expect(resolveDbFile({}, d)).toBe(join(d, 'pinion.db'));
    expect(notes(join(d, 'pinion.db'))).toEqual(['my chats']);
    expect(existsSync(join(d, 'openchat.db-wal'))).toBe(false);
  });

  it('leaves a database that is in use where it is', () => {
    const d = dir();
    oldDb(join(d, 'openchat.db'), true);
    expect(resolveDbFile({}, d)).toBe(join(d, 'openchat.db'));
    expect(existsSync(join(d, 'openchat.db'))).toBe(true);
    expect(existsSync(join(d, 'pinion.db'))).toBe(false);
  });

  it('prefers pinion.db when both exist', () => {
    const d = dir();
    oldDb(join(d, 'openchat.db'));
    writeFileSync(join(d, 'pinion.db'), '');
    expect(resolveDbFile({}, d)).toBe(join(d, 'pinion.db'));
    expect(notes(join(d, 'openchat.db'))).toEqual(['my chats']);
  });

  it('uses PINION_DB when set, and moves nothing', () => {
    const d = dir();
    oldDb(join(d, 'openchat.db'));
    expect(resolveDbFile({ PINION_DB: 'a.db' }, d)).toBe('a.db');
    expect(existsSync(join(d, 'openchat.db'))).toBe(true);
  });

  it('uses the default when PINION_DB is blank, never an empty path', () => {
    const d = dir();
    expect(resolveDbFile({ PINION_DB: '' }, d)).toBe(join(d, 'pinion.db'));
  });
});
