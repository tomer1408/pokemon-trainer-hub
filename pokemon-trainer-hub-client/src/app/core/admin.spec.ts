import { TestBed } from '@angular/core/testing';
import { AuthService } from '@auth0/auth0-angular';
import { of, throwError } from 'rxjs';
import { AdminService } from './admin';

function base64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeToken(payload: unknown): string {
  return `${base64url({ alg: 'RS256' })}.${base64url(payload)}.fake-signature`;
}

describe('AdminService', () => {
  function setup(auth: {
    isLoading$?: unknown;
    isAuthenticated$?: unknown;
    getAccessTokenSilently?: () => unknown;
  }) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isLoading$: auth.isLoading$ ?? of(false),
            isAuthenticated$: auth.isAuthenticated$ ?? of(true),
            getAccessTokenSilently: auth.getAccessTokenSilently ?? (() => of(fakeToken({ permissions: [] }))),
          },
        },
      ],
    });
    return TestBed.inject(AdminService);
  }

  it('resolves the real permissions array from a valid token, once authenticated', () => {
    const service = setup({
      getAccessTokenSilently: () => of(fakeToken({ permissions: ['admin:read', 'support:manage'] })),
    });

    expect(service.permissions()).toEqual(['admin:read', 'support:manage']);
    expect(service.hasPermission('admin:read')).toBe(true);
    expect(service.hasPermission('database:read')).toBe(false);
  });

  it('resolves to an empty array while auth is still loading (never grants access early)', () => {
    // isLoading$ never settles to false — the chain should never proceed past it.
    const service = setup({ isLoading$: of(true) });

    expect(service.permissions()).toEqual([]);
    expect(service.hasPermission('admin:read')).toBe(false);
  });

  it('resolves to an empty array when not authenticated', () => {
    const service = setup({ isAuthenticated$: of(false) });

    expect(service.permissions()).toEqual([]);
  });

  it('resolves to an empty array when getAccessTokenSilently() rejects', () => {
    const service = setup({ getAccessTokenSilently: () => throwError(() => new Error('no session')) });

    expect(service.permissions()).toEqual([]);
  });

  it('resolves to an empty array when the token has no permissions claim', () => {
    const service = setup({ getAccessTokenSilently: () => of(fakeToken({ sub: 'auth0|abc' })) });

    expect(service.permissions()).toEqual([]);
  });

  it('resolves to an empty array when the permissions claim is malformed (not an array)', () => {
    const service = setup({ getAccessTokenSilently: () => of(fakeToken({ permissions: 'admin:read' })) });

    expect(service.permissions()).toEqual([]);
  });

  it('resolves to an empty array when the token itself is undecodable', () => {
    const service = setup({ getAccessTokenSilently: () => of('not-a-real-jwt') });

    expect(service.permissions()).toEqual([]);
  });
});
