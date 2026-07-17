import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AdminService } from '../core/admin';
import { adminGuard } from './admin-guard';

function setupGuard(permissions$: Observable<string[]>) {
  const parseUrl = vi.fn((url: string) => `parsed:${url}` as unknown as ReturnType<Router['parseUrl']>);
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminService, useValue: { permissions$ } },
      { provide: Router, useValue: { parseUrl } },
    ],
  });
  return { parseUrl };
}

async function runGuard(requiredPermission: string | undefined): Promise<unknown> {
  return new Promise((resolve) => {
    const route = { data: { permission: requiredPermission } } as never;
    const result = TestBed.runInInjectionContext(() => adminGuard(route, {} as never));
    if (result && typeof (result as any).subscribe === 'function') {
      (result as any).subscribe(resolve);
    } else {
      resolve(result);
    }
  });
}

describe('adminGuard', () => {
  it('is generic — allows access when the token has the SPECIFIC permission the route declares (not a hardcoded one)', async () => {
    setupGuard(of(['support:manage']));

    const result = await runGuard('support:manage');

    expect(result).toBe(true);
  });

  it('allows a different route requiring a different permission, same guard, no code change needed', async () => {
    setupGuard(of(['database:read']));

    const result = await runGuard('database:read');

    expect(result).toBe(true);
  });

  it('redirects to /admin/access-denied (never /home) when the required permission is missing', async () => {
    const { parseUrl } = setupGuard(of(['support:manage']));

    const result = await runGuard('admin:read');

    expect(parseUrl).toHaveBeenCalledWith('/admin/access-denied');
    expect(result).toBe('parsed:/admin/access-denied');
  });

  it('redirects to /admin/access-denied when the token has no permissions at all', async () => {
    const { parseUrl } = setupGuard(of([]));

    const result = await runGuard('admin:read');

    expect(parseUrl).toHaveBeenCalledWith('/admin/access-denied');
    expect(result).toBe('parsed:/admin/access-denied');
  });

  it('redirects to /admin/access-denied when the route declares no required permission at all', async () => {
    const { parseUrl } = setupGuard(of(['admin:read']));

    const result = await runGuard(undefined);

    expect(parseUrl).toHaveBeenCalledWith('/admin/access-denied');
    expect(result).toBe('parsed:/admin/access-denied');
  });
});
