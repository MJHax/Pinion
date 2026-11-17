import type { Env } from './settings';

/** The settings that can come from the environment, named without their PINION_ prefix. */
export type PinionVar = 'HOST' | 'PORT' | 'DB' | 'DETECT_HOST' | 'ALLOWED_HOSTS' | 'TAVILY_URL';

/** PINION_<name>, or undefined when it is missing or blank, so `PINION_DB=` in .env means "use the default". */
export function envVar(env: Env, name: PinionVar): string | undefined {
  const value = env[`PINION_${name}`];
  return value?.trim() ? value : undefined;
}
