import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of } from 'rxjs';
import { AdminService } from '../../core/admin';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { PokemonService } from '../../core/pokemon';
import { ThemeService } from '../theme';
import { Navbar } from './navbar';

describe('Navbar', () => {
  function setup(options: { profile?: TrainerProfile | null; authUser?: { name?: string; email?: string } | null } = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user$: of(options.authUser ?? null) } },
        { provide: ProfileService, useValue: { getProfile: () => of(options.profile ?? null) } },
        { provide: PokemonService, useValue: { getById: () => of(null) } },
        // Navbar renders AccountMenu, which now checks AdminService for the
        // conditional Admin link — mocked here so this file doesn't need to
        // also stub AuthService's isLoading$/isAuthenticated$/token methods
        // just to satisfy a dependency unrelated to what this file tests.
        { provide: AdminService, useValue: { hasPermission: () => false } },
      ],
    });
    const fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();
    return fixture;
  }

  function profile(overrides: Partial<TrainerProfile> = {}): TrainerProfile {
    return {
      trainerName: 'Ash',
      favoriteType: 'electric',
      experienceLevel: 'Beginner',
      firstName: 'Ash',
      lastName: 'Ketchum',
      dateOfBirth: '2000-01-01',
      country: 'Japan',
      avatarPokemonId: null,
      teamName: null,
      acceptedPolicy: true,
      marketingEmailsOptIn: false,
      ...overrides,
    };
  }

  it('prefers the real TrainerProfile name over the Auth0 profile name', () => {
    const fixture = setup({ profile: profile({ trainerName: 'Ash the Great' }), authUser: { name: 'ash123' } });
    expect((fixture.componentInstance as any).trainerName()).toBe('Ash the Great');
  });

  it('falls back to the Auth0 name when there is no TrainerProfile yet', () => {
    const fixture = setup({ profile: null, authUser: { name: 'ash123' } });
    expect((fixture.componentInstance as any).trainerName()).toBe('ash123');
  });

  it('falls back to "Trainer" when neither a profile nor an Auth0 name exists', () => {
    const fixture = setup({ profile: null, authUser: null });
    expect((fixture.componentInstance as any).trainerName()).toBe('Trainer');
  });

  it('derives trainerEmail from the Auth0 user', () => {
    const fixture = setup({ authUser: { email: 'ash@example.com' } });
    expect((fixture.componentInstance as any).trainerEmail()).toBe('ash@example.com');
  });

  it('defaults trainerEmail to an empty string when there is no Auth0 user', () => {
    const fixture = setup({ authUser: null });
    expect((fixture.componentInstance as any).trainerEmail()).toBe('');
  });

  it('setDark()/setLight()/setPikachu() delegate to the shared ThemeService', () => {
    const fixture = setup();
    const theme = TestBed.inject(ThemeService);

    fixture.componentInstance.setLight();
    expect(theme.mode()).toBe('light');

    fixture.componentInstance.setPikachu();
    expect(theme.mode()).toBe('pikachu');

    fixture.componentInstance.setDark();
    expect(theme.mode()).toBe('dark');
  });
});
