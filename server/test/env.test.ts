import { describe, it, expect } from 'vitest';
import { envVar } from '../src/env';

describe('envVar', () => {
  it('reads the PINION_ name', () => {
    expect(envVar({ PINION_PORT: '4000' }, 'PORT')).toBe('4000');
  });

  it('is undefined when it is not set', () => {
    expect(envVar({}, 'PORT')).toBeUndefined();
  });

  it('ignores the old OPENCHAT_ name', () => {
    expect(envVar({ OPENCHAT_PORT: '5000' }, 'PORT')).toBeUndefined();
  });

  it('treats a blank value as not set, so the default is used', () => {
    expect(envVar({ PINION_DB: '' }, 'DB')).toBeUndefined();
    expect(envVar({ PINION_PORT: '  ' }, 'PORT')).toBeUndefined();
  });
});
