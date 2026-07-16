import { TestBed } from '@angular/core/testing';
import { AuthService } from '@auth0/auth0-angular';
import { of } from 'rxjs';
import { ColorblindService } from '../colorblind';
import { markStarterQuizSkipped } from '../quiz/quiz-completion';
import { AccountMenu } from './account-menu';

describe('AccountMenu', () => {
  let logout: ReturnType<typeof vi.fn>;

  function setup(trainerName = 'Ash') {
    logout = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { logout } }],
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
});
