import { maskAuth0Id } from './mask-auth0-id';

describe('maskAuth0Id', () => {
  it('masks a real auth0|<hex> id, keeping the provider prefix visible', () => {
    expect(maskAuth0Id('auth0|64f2b3c1a9d8e7f6')).toBe('auth0|64f2…e7f6');
  });

  it('never returns the full raw id for a long value', () => {
    const id = 'auth0|64f2b3c1a9d8e7f6';
    expect(maskAuth0Id(id)).not.toBe(id);
    expect(maskAuth0Id(id)).not.toContain('b3c1a9d8');
  });

  it('does not truncate a short id segment that is already short enough', () => {
    expect(maskAuth0Id('auth0|abc')).toBe('auth0|abc');
  });

  it('handles an id with no provider separator at all', () => {
    expect(maskAuth0Id('abcdefghijklmnop')).toBe('abcd…mnop');
  });

  it('leaves a short id with no separator untouched', () => {
    expect(maskAuth0Id('short')).toBe('short');
  });
});
