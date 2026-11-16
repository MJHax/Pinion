import type { Env } from './settings';

/** The settings that can come from the environment, named without their PINION_ prefix. */
export type PinionVar = 'HOST' | 'PORT' | 'DB' | 'DETECT_HOST' | 'ALLOWED_HOSTS' | 'TAVILY_URL';

/** PINION_<name>, or the OPENCHAT_<name> it was called before the rename when that is the only one set. */
export function envVar(env: Env, name: PinionVar): string | undefined {
  return env[`PINION_${name}`] ?? env[`OPENCHAT_${name}`];
}
