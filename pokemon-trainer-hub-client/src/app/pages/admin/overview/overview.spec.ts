import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminService } from '../../../core/admin';
import { AdminOverview } from './overview';

describe('AdminOverview (Phase 0 verification page)', () => {
  function setup(ping: () => ReturnType<AdminService['ping']>) {
    TestBed.configureTestingModule({
      providers: [{ provide: AdminService, useValue: { ping } }],
    });
    const fixture = TestBed.createComponent(AdminOverview);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the real message once the ping succeeds', () => {
    const fixture = setup(() => of({ status: 'ok', message: 'Admin API reachable.' }));
    const inst = fixture.componentInstance as any;

    expect(inst.checking()).toBe(false);
    expect(inst.message()).toBe('Admin API reachable.');
    expect(inst.error()).toBeNull();
  });

  it('shows a real error state when the ping fails', () => {
    const fixture = setup(() => throwError(() => new Error('network down')));
    const inst = fixture.componentInstance as any;

    expect(inst.checking()).toBe(false);
    expect(inst.error()).toBe('Could not reach the Admin API.');
    expect(inst.message()).toBeNull();
  });
});
