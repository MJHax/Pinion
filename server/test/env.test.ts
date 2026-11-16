import { describe, it, expect } from 'vitest';
import { envVar } from '../src/env';

describe('envVar', () => {
  it('reads the PINION_ name first', () => {
    expect(envVar({ PINION_PORT: '4000', OPENCHAT_PORT: '5000' }, 'PORT')).toBe('4000');
  });

  it('falls back to the old OPENCHAT_ name', () => {
    expect(envVar({ OPENCHAT_PORT: '5000' }, 'PORT')).toBe('5000');
  });

  it('is undefined when neither is set', () => {
    expect(envVar({}, 'PORT')).toBeUndefined();
  });

  it('keeps an explicitly empty PINION_ value instead of the old one', () => {
    expect(envVar({ PINION_HOST: '', OPENCHAT_HOST: '0.0.0.0' }, 'HOST')).toBe('');
  });
});
