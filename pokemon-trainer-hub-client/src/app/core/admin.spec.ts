import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '@auth0/auth0-angular';
import { of, throwError } from 'rxjs';
import { API_BASE } from './api-base';
import { AdminService } from './admin';

function base64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeToken(payload: unknown): string {
  return `${base64url({ alg: 'RS256' })}.${base64url(payload)}.fake-signature`;
}

describe('AdminService', () => {
  let httpMock: HttpTestingController;

  function setup(auth: {
    isLoading$?: unknown;
    isAuthenticated$?: unknown;
    getAccessTokenSilently?: () => unknown;
  }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
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
    const service = TestBed.inject(AdminService);
    httpMock = TestBed.inject(HttpTestingController);
    return service;
  }

  afterEach(() => httpMock.verify());

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

  it('ping() calls the real GET /api/admin/ping endpoint', () => {
    const service = setup({});
    let result: { status: string; message: string } | undefined;
    service.ping().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/admin/ping`);
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'ok', message: 'Admin API reachable.' });

    expect(result).toEqual({ status: 'ok', message: 'Admin API reachable.' });
  });
});
