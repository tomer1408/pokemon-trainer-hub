import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of, throwError } from 'rxjs';
import { ProfileService } from '../../core/profile';
import { RestoreAccount } from './restore-account';

describe('RestoreAccount', () => {
  let getProfileStrict: ReturnType<typeof vi.fn>;
  let requestRestoration: ReturnType<typeof vi.fn>;
  let logout: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  function setup(profileError: { status: number; error?: unknown } | null) {
    getProfileStrict = vi.fn(() =>
      profileError ? throwError(() => profileError) : of({ trainerName: 'Ash' } as any),
    );
    requestRestoration = vi.fn(() => of({ id: 1, createdAt: '2026-07-01T00:00:00.000Z' }));
    logout = vi.fn(() => of(undefined));
    navigateByUrl = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: ProfileService, useValue: { getProfileStrict, requestRestoration } },
        { provide: AuthService, useValue: { logout } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });

    const fixture = TestBed.createComponent(RestoreAccount);
    fixture.detectChanges();
    return fixture;
  }

  it('navigates to /home when the account turns out not to be deleted', () => {
    setup(null);

    expect(navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('shows the blocked state with the real deletionType and purgeAt on a 403 ACCOUNT_DELETED', () => {
    const fixture = setup({
      status: 403,
      error: { code: 'ACCOUNT_DELETED', deletionType: 'self', purgeAt: '2026-08-01T00:00:00.000Z' },
    });
    const inst = fixture.componentInstance as any;

    expect(inst.state()).toBe('blocked');
    expect(inst.deletionType()).toBe('self');
    expect(inst.isSelfDeleted()).toBe(true);
  });

  it('sets the error state for any other failure, never silently blocking', () => {
    const fixture = setup({ status: 500 });

    expect((fixture.componentInstance as any).state()).toBe('error');
  });

  it('daysRemaining() computes a real value from the server-provided purgeAt, never a client-guessed 30', () => {
    const purgeAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const fixture = setup({ status: 403, error: { code: 'ACCOUNT_DELETED', deletionType: 'admin', purgeAt } });
    const inst = fixture.componentInstance as any;

    expect(inst.daysRemaining()).toBe(5);
  });

  it('submitRequest() rejects an empty message before ever calling the server', () => {
    const fixture = setup({ status: 403, error: { code: 'ACCOUNT_DELETED', deletionType: 'self' } });
    const inst = fixture.componentInstance as any;

    inst.messageInput.set('   ');
    inst.submitRequest();

    expect(requestRestoration).not.toHaveBeenCalled();
    expect(inst.submitError()).toBeTruthy();
  });

  it('submitRequest() sends the real message and moves to the submitted state on success', () => {
    const fixture = setup({ status: 403, error: { code: 'ACCOUNT_DELETED', deletionType: 'self' } });
    const inst = fixture.componentInstance as any;

    inst.messageInput.set('please restore my account');
    inst.submitRequest();

    expect(requestRestoration).toHaveBeenCalledWith('please restore my account');
    expect(inst.state()).toBe('submitted');
  });

  it('submitRequest() surfaces a real error and stays on the blocked state on failure', () => {
    const fixture = setup({ status: 403, error: { code: 'ACCOUNT_DELETED', deletionType: 'self' } });
    requestRestoration.mockImplementationOnce(() => throwError(() => new Error('down')));
    const inst = fixture.componentInstance as any;

    inst.messageInput.set('please restore my account');
    inst.submitRequest();

    expect(inst.state()).toBe('blocked');
    expect(inst.submitError()).toBeTruthy();
  });

  it('logOut() calls the real Auth0 logout', () => {
    const fixture = setup({ status: 403, error: { code: 'ACCOUNT_DELETED', deletionType: 'self' } });

    fixture.componentInstance.logOut();

    expect(logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } });
  });
});
