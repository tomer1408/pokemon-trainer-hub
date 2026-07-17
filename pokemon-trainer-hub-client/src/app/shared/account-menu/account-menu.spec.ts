import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of } from 'rxjs';
import { AdminService } from '../../core/admin';
import { ColorblindService } from '../colorblind';
import { markStarterQuizSkipped } from '../quiz/quiz-completion';
import { AccountMenu } from './account-menu';

describe('AccountMenu', () => {
  let logout: ReturnType<typeof vi.fn>;
  let hasPermission: ReturnType<typeof vi.fn>;

  function setup(trainerName = 'Ash') {
    logout = vi.fn(() => of(undefined));
    hasPermission = vi.fn(() => false);
    TestBed.configureTestingModule({
      providers: [
        // provideRouter is only exercised once a test actually opens the
        // panel (toggleOpen()) — that's the first point any of this
        // component's routerLink anchors get instantiated at all.
        provideRouter([]),
        { provide: AuthService, useValue: { logout } },
        { provide: AdminService, useValue: { hasPermission } },
      ],
    });
    const fixture = TestBed.createComponent(AccountMenu);
    fixture.componentRef.setInput('trainerName', trainerName);
    fixture.detectChanges();
    return fixture;
  }

  it('derives the avatar initial from the trainer name, uppercased', () => {
    const fixture = setup('ash');
    expect((fixture.componentInstance as any).initial()).toBe('A');
  });

  it('falls back to "T" when the trainer name is empty', () => {
    const fixture = setup('');
    expect((fixture.componentInstance as any).initial()).toBe('T');
  });

  it('toggleOpen()/close() control the open state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.open()).toBe(false);
    inst.toggleOpen();
    expect(inst.open()).toBe(true);
    inst.close();
    expect(inst.open()).toBe(false);
  });

  it('closes on Escape only while open', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.onEscape();
    expect(inst.open()).toBe(false);

    inst.toggleOpen();
    inst.onEscape();
    expect(inst.open()).toBe(false);
  });

  it('setColorblindMode() delegates to the real, app-wide ColorblindService', () => {
    const fixture = setup();
    const colorblind = TestBed.inject(ColorblindService);
    (fixture.componentInstance as any).setColorblindMode('protanopia');
    expect(colorblind.mode()).toBe('protanopia');
  });

  it('logout() clears the session-scoped starter-quiz skip and calls Auth0 logout with the right returnTo', () => {
    sessionStorage.clear();
    markStarterQuizSkipped();
    const fixture = setup();

    (fixture.componentInstance as any).logout();

    expect(sessionStorage.getItem('pth.starterQuizSkipped')).toBeNull();
    expect(logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } });
  });

  it('does not render the Admin link when the trainer lacks admin:read', () => {
    const fixture = setup();
    (fixture.componentInstance as any).toggleOpen();
    fixture.detectChanges();

    const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('a.item');
    expect(Array.from(links).some((a) => a.textContent?.includes('Admin'))).toBe(false);
  });

  it('renders the Admin link when the trainer has admin:read', () => {
    hasPermission = vi.fn((p: string) => p === 'admin:read');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout: vi.fn(() => of(undefined)) } },
        { provide: AdminService, useValue: { hasPermission } },
      ],
    });
    const fixture = TestBed.createComponent(AccountMenu);
    fixture.componentRef.setInput('trainerName', 'Ash');
    fixture.detectChanges();
    (fixture.componentInstance as any).toggleOpen();
    fixture.detectChanges();

    const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('a.item');
    expect(Array.from(links).some((a) => a.textContent?.includes('Admin'))).toBe(true);
  });
});
