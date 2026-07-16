import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { AvatarIconsService, AvatarIconOption } from '../../core/avatar-icons';
import { Profile } from './profile';

describe('Profile', () => {
  let getProfileStrict: ReturnType<typeof vi.fn>;
  let saveProfile: ReturnType<typeof vi.fn>;

  const icons: AvatarIconOption[] = [
    { pokemonId: 25, name: 'pikachu', category: 'popular', spriteUrl: 's25' },
    { pokemonId: 4, name: 'charmander', category: 'fire', spriteUrl: 's4' },
  ];

  function member(id: number): DreamTeamMember {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', position: 0, stats: [], types: [], baseExperience: 100 };
  }

  function favorite(id: number): FavoritePokemon {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', stats: [], types: [], baseExperience: 100 };
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
      avatarPokemonId: 25,
      teamName: 'Thunder Squad',
      acceptedPolicy: true,
      acceptedPolicyAt: '2026-01-01T00:00:00.000Z',
      policyVersion: 'v1',
      marketingEmailsOptIn: false,
      createdAt: '2025-06-15T00:00:00.000Z',
      ...overrides,
    };
  }

  function setup(options: {
    profile?: TrainerProfile | null;
    profileError?: { status: number };
    team?: DreamTeamMember[];
    favorites?: FavoritePokemon[];
    saveError?: any;
  } = {}) {
    getProfileStrict = vi.fn(() =>
      options.profileError ? throwError(() => options.profileError) : of(options.profile === undefined ? profile() : options.profile),
    );
    saveProfile = vi.fn(() => (options.saveError ? throwError(() => options.saveError) : of(profile())));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ProfileService, useValue: { getProfileStrict, saveProfile } },
        { provide: TeamService, useValue: { getTeam: () => of(options.team ?? []) } },
        { provide: FavoritesService, useValue: { getFavorites: () => of(options.favorites ?? []) } },
        { provide: AvatarIconsService, useValue: { getAvatarIcons: () => of(icons) } },
      ],
    });
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    return fixture;
  }

  it('derives status "ok" on a normal fetch', () => {
    expect((setup().componentInstance as any).hasError()).toBe(false);
  });

  it('derives status "missing" on a 404 (onboarding not finished yet)', () => {
    expect((setup({ profileError: { status: 404 } }).componentInstance as any).hasNoProfile()).toBe(true);
  });

  it('derives status "error" for any other fetch failure', () => {
    expect((setup({ profileError: { status: 500 } }).componentInstance as any).hasError()).toBe(true);
  });

  it('seeds saved() from the loaded profile, converting dateOfBirth to a real Date', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.saved().trainerName).toBe('Ash');
    expect(inst.saved().dateOfBirth).toBeInstanceOf(Date);
  });

  it('memberSince() formats the real profile creation date', () => {
    expect((setup().componentInstance as any).memberSince()).toBe('June 2025');
  });

  it('memberSince() is null without a creation date', () => {
    expect((setup({ profile: profile({ createdAt: undefined }) }).componentInstance as any).memberSince()).toBeNull();
  });

  it('teamCompletionPct() reflects the real team size out of 5', () => {
    const fixture = setup({ team: [member(1), member(2)] });
    expect((fixture.componentInstance as any).teamCompletionPct()).toBe(40);
  });

  it('achievements() only earns badges with a real, checkable condition', () => {
    const fixture = setup({ team: [member(1), member(2), member(3), member(4), member(5)], favorites: [favorite(1), favorite(2), favorite(3), favorite(4), favorite(5)] });
    const inst = fixture.componentInstance as any;
    const earned = inst.achievements().filter((a: any) => a.earned).map((a: any) => a.name);
    expect(earned).toEqual(['First Catch', 'Squad Goals', 'Type Enthusiast']);
    expect(inst.earnedAchievementsCount()).toBe(3);
  });

  it('avatarSprite()/draftAvatarSprite() resolve the real sprite for the saved/draft avatar id', () => {
    const fixture = setup();
    expect((fixture.componentInstance as any).avatarSprite()).toBe('s25');
  });

  it('formattedDob() renders in UTC, long-form, matching the real stored date', () => {
    const fixture = setup();
    expect(fixture.componentInstance.formattedDob()).toBe('January 1, 2000');
  });

  it('retry() re-fetches the profile', () => {
    const fixture = setup();
    fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(getProfileStrict).toHaveBeenCalledTimes(2);
  });

  it('startEdit() seeds the draft from saved() and opens the modal', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    expect(inst.modalOpen()).toBe(true);
    expect(inst.draft()).toEqual(inst.saved());
  });

  it('requestCloseModal() closes immediately when nothing changed', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    fixture.componentInstance.requestCloseModal();
    expect(inst.modalOpen()).toBe(false);
    expect(inst.showDiscardConfirm()).toBe(false);
  });

  it('requestCloseModal() asks for discard confirmation when the draft is dirty', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    fixture.componentInstance.updateDraft('teamName', 'New Name');

    fixture.componentInstance.requestCloseModal();

    expect(inst.showDiscardConfirm()).toBe(true);
    expect(inst.modalOpen()).toBe(true); // still open until confirmed
  });

  it('confirmDiscard() closes the modal and clears the draft', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    fixture.componentInstance.updateDraft('teamName', 'New Name');
    fixture.componentInstance.requestCloseModal();

    fixture.componentInstance.confirmDiscard();

    expect(inst.modalOpen()).toBe(false);
    expect(inst.draft()).toBeNull();
  });

  it('cancelDiscard() keeps the modal open with the draft intact', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    fixture.componentInstance.updateDraft('teamName', 'New Name');
    fixture.componentInstance.requestCloseModal();

    fixture.componentInstance.cancelDiscard();

    expect(inst.showDiscardConfirm()).toBe(false);
    expect(inst.modalOpen()).toBe(true);
    expect(inst.draft().teamName).toBe('New Name');
  });

  it('selectNone() clears the draft avatar and empties the category grid (no real category matches "none")', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();

    fixture.componentInstance.selectNone();

    expect(inst.draft().avatarPokemonId).toBeNull();
    expect(inst.iconsInCategory()).toEqual([]);
  });

  it('isDirty() is false until the draft genuinely differs from saved()', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    expect(inst.isDirty()).toBe(false);

    fixture.componentInstance.updateFavoriteType('Fire');

    expect(inst.isDirty()).toBe(true);
  });

  it('requestSave() is a no-op when not dirty', () => {
    const fixture = setup();
    fixture.componentInstance.startEdit();
    fixture.componentInstance.requestSave();
    expect((fixture.componentInstance as any).showSaveConfirm()).toBe(false);
  });

  it('requestSave() opens the confirm step once dirty; cancelSaveConfirm() closes it', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    fixture.componentInstance.updateDraft('teamName', 'New Name');

    fixture.componentInstance.requestSave();
    expect(inst.showSaveConfirm()).toBe(true);

    fixture.componentInstance.cancelSaveConfirm();
    expect(inst.showSaveConfirm()).toBe(false);
  });

  it('confirmSaveChanges() saves, shows a toast, and closes the modal on success', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    fixture.componentInstance.updateDraft('teamName', 'New Name');

    fixture.componentInstance.confirmSaveChanges();

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ teamName: 'New Name' }));
    expect(inst.saved().teamName).toBe('New Name');
    expect(inst.showSavedToast()).toBe(true);
    expect(inst.modalOpen()).toBe(false);
  });

  it('confirmSaveChanges() surfaces the server\'s validation message and keeps the modal open on failure', () => {
    const fixture = setup({ saveError: { status: 400, error: { message: 'Team name must be 2-40 characters with no control characters.' } } });
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    fixture.componentInstance.updateDraft('teamName', 'A');

    fixture.componentInstance.confirmSaveChanges();

    expect(inst.saveError()).toBe('Team name must be 2-40 characters with no control characters.');
    expect(inst.modalOpen()).toBe(true);
    expect(inst.showSaveConfirm()).toBe(false);
  });

  it('confirmSaveChanges() falls back to a generic message for a non-400 failure', () => {
    const fixture = setup({ saveError: { status: 500 } });
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    fixture.componentInstance.updateDraft('teamName', 'New Name');

    fixture.componentInstance.confirmSaveChanges();

    expect(inst.saveError()).toBe('Something went wrong saving your profile. Please try again.');
  });

  it('onNameSelected() updates the draft team name without saving or closing the edit modal', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startEdit();
    fixture.componentInstance.openNameGenerator();

    fixture.componentInstance.onNameSelected('Thunder Squad Prime');

    expect(inst.draft().teamName).toBe('Thunder Squad Prime');
    expect(inst.showNameGenerator()).toBe(false);
    expect(saveProfile).not.toHaveBeenCalled();
  });
});
