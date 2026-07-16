import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of, throwError } from 'rxjs';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService } from '../../core/favorites';
import { PokemonService } from '../../core/pokemon';
import { Home } from './home';

describe('Home', () => {
  let getProfileStrict: ReturnType<typeof vi.fn>;
  let getTeamStrict: ReturnType<typeof vi.fn>;
  let addToTeam: ReturnType<typeof vi.fn>;
  let removeFromTeam: ReturnType<typeof vi.fn>;

  function member(id: number, overrides: Partial<DreamTeamMember> = {}): DreamTeamMember {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', position: 0, stats: [], types: ['fire'], baseExperience: 100, ...overrides };
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
      hasCompletedStarterQuiz: true,
      ...overrides,
    };
  }

  function setup(options: {
    profile?: TrainerProfile | null;
    profileError?: { status: number };
    team?: DreamTeamMember[];
    teamError?: boolean;
    addToTeamResult?: any;
    authUser?: { name?: string } | null;
  } = {}) {
    getProfileStrict = vi.fn(() =>
      options.profileError ? throwError(() => options.profileError) : of(options.profile === undefined ? profile() : options.profile),
    );
    getTeamStrict = vi.fn(() => (options.teamError ? throwError(() => new Error('down')) : of(options.team ?? [])));
    addToTeam = vi.fn(() => of(options.addToTeamResult ?? { ok: true }));
    removeFromTeam = vi.fn(() => of(undefined));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user$: of(options.authUser ?? null) } },
        { provide: ProfileService, useValue: { getProfileStrict } },
        { provide: TeamService, useValue: { getTeamStrict, addToTeam, removeFromTeam } },
        { provide: FavoritesService, useValue: { getFavorites: () => of([]), addFavorite: vi.fn(() => of(true)), removeFavorite: vi.fn(() => of(true)) } },
        { provide: PokemonService, useValue: { getById: () => of(null), search: () => of({ results: [], page: 1, pageSize: 20, total: 0 }) } },
      ],
    });
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    return fixture;
  }

  it('trainerName() prefers the real profile name over the Auth0 name', () => {
    expect((setup({ profile: profile({ trainerName: 'Ash the Great' }) }).componentInstance as any).trainerName()).toBe('Ash the Great');
  });

  it('trainerName() falls back to the Auth0 name when there is no profile yet', () => {
    expect((setup({ profile: null, authUser: { name: 'ash123' } }).componentInstance as any).trainerName()).toBe('ash123');
  });

  it('trainerName() falls back to "Trainer" when neither a profile nor an Auth0 name exists', () => {
    expect((setup({ profile: null, authUser: null }).componentInstance as any).trainerName()).toBe('Trainer');
  });

  it('showQuizNudge() is true when a real profile exists and the quiz is not yet completed', () => {
    expect((setup({ profile: profile({ hasCompletedStarterQuiz: false }) }).componentInstance as any).showQuizNudge()).toBe(true);
  });

  it('showQuizNudge() is false once the quiz is completed', () => {
    expect((setup({ profile: profile({ hasCompletedStarterQuiz: true }) }).componentInstance as any).showQuizNudge()).toBe(false);
  });

  it('showQuizNudge() is false with no profile at all', () => {
    expect((setup({ profile: null }).componentInstance as any).showQuizNudge()).toBe(false);
  });

  it('hasError() is false for a 404 profile (no profile yet is not an error)', () => {
    const fixture = setup({ profileError: { status: 404 } });
    expect((fixture.componentInstance as any).hasError()).toBe(false);
  });

  it('hasError() is true for a genuine profile-fetch failure', () => {
    const fixture = setup({ profileError: { status: 500 } });
    expect((fixture.componentInstance as any).hasError()).toBe(true);
  });

  it('hasError() is true when the team fetch fails, even if the profile loaded fine', () => {
    const fixture = setup({ teamError: true });
    expect((fixture.componentInstance as any).hasError()).toBe(true);
  });

  it('topType() picks the single dominant type when there is no tie', () => {
    const fixture = setup({ team: [member(1, { types: ['fire'] }), member(2, { types: ['fire'] }), member(3, { types: ['water'] })] });
    expect((fixture.componentInstance as any).topType()).toBe('fire');
  });

  it('topType() breaks a tie by the type of the single strongest tied Pokémon', () => {
    const fixture = setup({
      team: [
        member(1, { types: ['fire'], baseExperience: 50 }),
        member(2, { types: ['water'], baseExperience: 300 }),
      ],
    });
    // fire and water are tied at 50% each; water's member (300) is stronger than fire's (50).
    expect((fixture.componentInstance as any).topType()).toBe('water');
  });

  it('topType() is null for an empty team', () => {
    const fixture = setup({ team: [] });
    expect((fixture.componentInstance as any).topType()).toBeNull();
  });

  it('rec() recommends exploring when the team is empty', () => {
    const fixture = setup({ team: [] });
    expect((fixture.componentInstance as any).rec().ctaHref).toBe('/explorer');
    expect((fixture.componentInstance as any).rec().title).toBe('Start by adding your first Pokémon');
  });

  it('rec() encourages continued building for a partial team', () => {
    const fixture = setup({ team: [member(1), member(2)] });
    const rec = (fixture.componentInstance as any).rec();
    expect(rec.subtitle).toContain('3 more Pokémon');
    expect(rec.ctaLabel).toBe('Continue Building');
  });

  it('rec() suggests Battle once the team is full', () => {
    const fixture = setup({ team: [member(1), member(2), member(3), member(4), member(5)] });
    expect((fixture.componentInstance as any).rec().ctaHref).toBe('/battle');
  });

  it('slots() pads the team up to 5 with null placeholders', () => {
    const fixture = setup({ team: [member(1)] });
    const slots = (fixture.componentInstance as any).slots();
    expect(slots.length).toBe(5);
    expect(slots[1]).toBeNull();
  });

  it('addToTeam(): no-op on-team, opens swap when full, adds and closes detail otherwise', () => {
    const onTeam = setup({ team: [member(25)] });
    onTeam.componentInstance.addToTeam(25);
    expect(addToTeam).not.toHaveBeenCalled();
  });

  it('addToTeam() opens the swap flow instead of adding when the team is full', () => {
    const full = setup({ team: [member(1), member(2), member(3), member(4), member(5)] });
    full.componentInstance.addToTeam(99);
    expect((full.componentInstance as any).swapCandidateId()).toBe(99);
    expect(addToTeam).not.toHaveBeenCalled();
  });

  it('addToTeam() adds and closes the detail modal when there is room', () => {
    const fixture = setup({ team: [] });
    const inst = fixture.componentInstance as any;
    inst.selectedPokemonId.set(99);
    fixture.componentInstance.addToTeam(99);
    expect(addToTeam).toHaveBeenCalledWith(99);
    expect(inst.selectedPokemonId()).toBeNull();
  });

  it('removeFromTeamModal() removes, refreshes, and closes the detail modal', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.selectedPokemonId.set(25);
    fixture.componentInstance.removeFromTeamModal(25);
    expect(removeFromTeam).toHaveBeenCalledWith(25);
    expect(inst.selectedPokemonId()).toBeNull();
  });

  it('retry() refreshes both the profile and the team', () => {
    const fixture = setup();
    fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(getProfileStrict).toHaveBeenCalledTimes(2);
    expect(getTeamStrict).toHaveBeenCalledTimes(2);
  });
});
