import { decodeJwtPayload } from './jwt-decode';

function base64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeToken(payload: unknown): string {
  return `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url(payload)}.fake-signature`;
}

describe('decodeJwtPayload', () => {
  it('decodes a real base64url-encoded JWT payload', () => {
    const token = fakeToken({ sub: 'auth0|abc', permissions: ['admin:read'] });
    expect(decodeJwtPayload(token)).toEqual({ sub: 'auth0|abc', permissions: ['admin:read'] });
  });

  it('returns null for a token with the wrong number of segments', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
    expect(decodeJwtPayload('a.b.c.d')).toBeNull();
  });

  it('returns null for a payload segment that is not valid base64', () => {
    expect(decodeJwtPayload('a.@@@not-base64@@@.c')).toBeNull();
  });

  it('returns null when the decoded payload is not valid JSON', () => {
    const notJson = btoa('not json at all').replace(/\+/g, '-').replace(/\//g, '_');
    expect(decodeJwtPayload(`a.${notJson}.c`)).toBeNull();
  });

  it('correctly restores padding for base64url strings of every length mod 4', () => {
    expect(decodeJwtPayload(fakeToken({ a: 1 }))).toEqual({ a: 1 });
    expect(decodeJwtPayload(fakeToken({ ab: 12 }))).toEqual({ ab: 12 });
    expect(decodeJwtPayload(fakeToken({ abc: 123 }))).toEqual({ abc: 123 });
  });
});
