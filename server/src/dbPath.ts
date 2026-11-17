import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Env } from './settings';
import { envVar } from './env';

/**
 * The database file to open: PINION_DB when set, otherwise data/pinion.db. An install from
 * before the rename has data/openchat.db instead; that file is moved to the new name once, and only when it is safe.
 */
export function resolveDbFile(env: Env, dataDir = 'data'): string {
  const chosen = envVar(env, 'DB');
  if (chosen !== undefined) return chosen;
  const file = join(dataDir, 'pinion.db');
  const old = join(dataDir, 'openchat.db');
  if (existsSync(file) || !existsSync(old)) return file;
  try {
    // Writes anything still waiting in the WAL into the main file. Closing the last connection then deletes the WAL,
    // so the one file holds every chat.
    const db = new Database(old, { fileMustExist: true });
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      db.close();
    }
    if (existsSync(`${old}-wal`)) {
      console.warn(`${old} is still open in another program (an older OpenChat?), so Pinion is using it where it is.`);
      return old;
    }
    renameSync(old, file);
    console.log(`Moved your chats from ${old} to ${file}.`);
    return file;
  } catch (err) {
    console.warn(`Couldn't move ${old} to ${file}, so Pinion is using it where it is:`, err);
    return old;
  }
}
