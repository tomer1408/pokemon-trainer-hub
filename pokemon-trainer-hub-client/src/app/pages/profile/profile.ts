import { Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { ExperienceLevel, POKEMON_TYPES, PokemonType } from '../../trainer-profile-options';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { TeamService } from '../../core/team';
import { FavoritesService } from '../../core/favorites';
import { AvatarIconsService, AvatarIconOption } from '../../core/avatar-icons';
import { AVATAR_CATEGORY_ORDER, AVATAR_CATEGORY_LABELS } from '../../shared/avatar-categories';
import { getTeamPower, getTeamTier } from '../../shared/team-power';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';
import { TeamNameGeneratorModal } from '../../shared/team-name-generator-modal/team-name-generator-modal';

interface ProfileDraft {
  trainerName: string;
  favoriteType: PokemonType;
  experienceLevel: ExperienceLevel;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  country: string;
  avatarPokemonId: number | null;
  teamName: string;
  acceptedPolicy: boolean;
  acceptedPolicyAt: string | null;
  policyVersion: string | null;
  marketingEmailsOptIn: boolean;
}

type ProfileFetchStatus = 'ok' | 'missing' | 'error';

// Matches My Profile.dc.html. The "Profile Icon" picker uses real Pokémon
// (real sprites/ids, saved to the real avatarPokemonId column) instead of the
// mockup's fictional 9-type avatar picker — same real-data approach used in
// Onboarding. The mockup's fake "Trainer ID number"/numeric "Level"/XP bar and
// most of its Achievements list have no real data behind them anywhere in
// this app (no battle system, no Pokédex-catch tracking) — see the
// memberSince/teamCompletionPct/achievements computed signals below for what
// they were replaced with instead of being faked.
//
// The Edit Profile modal only lets the trainer change Avatar, Favorite Type,
// and Team Name — Trainer Name is set once at onboarding and shown read-only
// here (like first/last name, date of birth, and country); policy
// acceptance is likewise permanent. Experience Level isn't user-editable
// anywhere (server-authoritative), so it's never shown in this modal at all.
@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink, LoadingScreen, TeamNameGeneratorModal],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile {
  private readonly profileService = inject(ProfileService);
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly avatarIconsService = inject(AvatarIconsService);
  protected readonly theme = inject(ThemeService);

  protected readonly iconOptions = toSignal(this.avatarIconsService.getAvatarIcons(), {
    initialValue: [] as AvatarIconOption[],
  });

  protected readonly categories = computed(() => {
    const present = new Set(this.iconOptions().map((i) => i.category));
    return AVATAR_CATEGORY_ORDER.filter((c) => present.has(c));
  });
  protected readonly selectedCategory = signal<string>(AVATAR_CATEGORY_ORDER[0]);
  protected readonly iconsInCategory = computed(() =>
    this.iconOptions().filter((i) => i.category === this.selectedCategory()),
  );

  categoryLabel(category: string): string {
    return AVATAR_CATEGORY_LABELS[category] ?? category;
  }

  selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected readonly pokemonTypes = POKEMON_TYPES;

  private readonly profileRefresh = signal(0);
  // Distinguishes a genuine fetch failure (real error state, retry-able)
  // from "this trainer hasn't finished onboarding yet" (404) — the old
  // getProfile() swallowed both into `null`, which left the page rendering
  // nothing at all in either case (no error message, no explanation).
  private readonly profileResult = toSignal(
    toObservable(this.profileRefresh).pipe(
      switchMap(() =>
        this.profileService.getProfileStrict().pipe(
          map((profile) => ({ status: 'ok' as ProfileFetchStatus, profile })),
          catchError((err) =>
            of({
              status: (err?.status === 404 ? 'missing' : 'error') as ProfileFetchStatus,
              profile: null as TrainerProfile | null,
            }),
          ),
        ),
      ),
    ),
  );
  private readonly loadedProfile = computed(() => this.profileResult()?.profile ?? null);
  protected readonly isLoading = computed(() => this.profileResult() === undefined);
  protected readonly hasError = computed(() => this.profileResult()?.status === 'error');
  protected readonly hasNoProfile = computed(() => this.profileResult()?.status === 'missing');

  protected readonly saved = signal<ProfileDraft | null>(null);
  protected readonly draft = signal<ProfileDraft | null>(null);

  // Editing now happens in an overlay modal (My Profile.dc (2).html) instead
  // of swapping the page's own content — showSaveConfirm/showDiscardConfirm
  // follow the same request/cancel/confirm idiom already used for Manage My
  // Team's save/revert/leave confirms.
  protected readonly modalOpen = signal(false);
  protected readonly showSaveConfirm = signal(false);
  protected readonly showDiscardConfirm = signal(false);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly showSavedToast = signal(false);

  protected readonly showNameGenerator = signal(false);

  protected readonly isDirty = computed(() => {
    const s = this.saved();
    const d = this.draft();
    if (!s || !d) return false;
    return JSON.stringify(s) !== JSON.stringify(d);
  });

  protected readonly team = toSignal(this.teamService.getTeam(), { initialValue: [] });
  protected readonly favorites = toSignal(this.favoritesService.getFavorites(), { initialValue: [] });

  protected readonly teamCount = computed(() => this.team().length);
  protected readonly hasTeam = computed(() => this.teamCount() > 0);
  protected readonly teamPower = computed(() => getTeamPower(this.team()));
  protected readonly trainerLevel = computed(() => getTeamTier(this.teamCount()));
  protected readonly favoritesCount = computed(() => this.favorites().length);
  protected readonly teamCompletionPct = computed(() => Math.round((this.teamCount() / 5) * 100));

  // "Member since" — real, from the profile row's own createdAt, unlike the
  // mockup's fabricated trainer ID number.
  protected readonly memberSince = computed(() => {
    const createdAt = this.loadedProfile()?.createdAt;
    if (!createdAt) return null;
    return new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  });

  // Only 3 badges, all with a real, checkable condition — the mockup's
  // "Battle Victor" (10 battles won) and "Pokédex 500" (catch 500 species)
  // have no real tracking anywhere in this app to check them against, and
  // "Master Tier"/"Squad Goals" would always unlock at exactly the same time
  // (Master tier IS "team full"), so they'd be a redundant duplicate pair.
  protected readonly achievements = computed(() => [
    { name: 'First Catch', desc: 'Add a Pokémon to your team or favorites', earned: this.teamCount() > 0 || this.favoritesCount() > 0 },
    { name: 'Squad Goals', desc: 'Fill all 5 Dream Team slots', earned: this.teamCount() >= 5 },
    { name: 'Type Enthusiast', desc: 'Favorite 5 or more Pokémon', earned: this.favoritesCount() >= 5 },
  ]);

  protected readonly avatarSprite = computed(() => this.spriteForIcon(this.saved()?.avatarPokemonId ?? null));
  protected readonly draftAvatarSprite = computed(() => this.spriteForIcon(this.draft()?.avatarPokemonId ?? null));
  protected readonly earnedAchievementsCount = computed(() => this.achievements().filter((b) => b.earned).length);

  private spriteForIcon(id: number | null): string | null {
    if (id == null) return null;
    return this.iconOptions().find((p) => p.pokemonId === id)?.spriteUrl ?? null;
  }

  constructor() {
    effect(() => {
      const profile = this.loadedProfile();
      if (profile) {
        this.saved.set({
          trainerName: profile.trainerName,
          favoriteType: profile.favoriteType as PokemonType,
          experienceLevel: profile.experienceLevel as ExperienceLevel,
          firstName: profile.firstName,
          lastName: profile.lastName,
          dateOfBirth: new Date(profile.dateOfBirth),
          country: profile.country,
          avatarPokemonId: profile.avatarPokemonId,
          teamName: profile.teamName ?? '',
          acceptedPolicy: profile.acceptedPolicy,
          acceptedPolicyAt: profile.acceptedPolicyAt ?? null,
          policyVersion: profile.policyVersion ?? null,
          marketingEmailsOptIn: profile.marketingEmailsOptIn,
        });
      }
    });
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type.toLowerCase() as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  formattedDob(): string {
    const s = this.saved();
    if (!s) return '—';
    // Explicit UTC — dateOfBirth is stored/parsed as a UTC-midnight instant,
    // so formatting in the browser's local timezone (the default) could
    // shift the displayed date back a day for any timezone behind UTC.
    return s.dateOfBirth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  retry(): void {
    this.profileRefresh.update((n) => n + 1);
  }

  startEdit(): void {
    const s = this.saved();
    if (!s) return;
    this.draft.set({ ...s });
    this.saveError.set(null);
    this.modalOpen.set(true);
  }

  // X button, overlay click, and the footer Cancel button all route through
  // here (matching the mockup) — unsaved edits get a Discard confirmation
  // instead of silently vanishing.
  requestCloseModal(): void {
    if (this.isDirty()) {
      this.showDiscardConfirm.set(true);
    } else {
      this.closeModal();
    }
  }

  private closeModal(): void {
    this.modalOpen.set(false);
    this.draft.set(null);
    this.saveError.set(null);
    this.showSaveConfirm.set(false);
    this.showDiscardConfirm.set(false);
  }

  cancelDiscard(): void {
    this.showDiscardConfirm.set(false);
  }

  confirmDiscard(): void {
    this.closeModal();
  }

  updateDraft(field: 'teamName', value: string): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, [field]: value });
  }

  openNameGenerator(): void {
    this.showNameGenerator.set(true);
  }

  closeNameGenerator(): void {
    this.showNameGenerator.set(false);
  }

  // The edit modal already has its own Save/Discard flow (confirmSaveChanges
  // below) — a picked suggestion only updates the draft, exactly like typing
  // it in by hand. It isn't persisted until the trainer hits Save Changes.
  onNameSelected(name: string): void {
    this.updateDraft('teamName', name);
    this.showNameGenerator.set(false);
  }

  updateFavoriteType(value: PokemonType): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, favoriteType: value });
  }

  selectIcon(pokemonId: number | null): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, avatarPokemonId: pokemonId });
  }

  // "None" isn't a real category, so setting selectedCategory to this value
  // naturally empties iconsInCategory (no icon's category ever matches it) —
  // the grid just disappears instead of still showing the last-browsed
  // category's icons underneath the highlighted None pill.
  selectNone(): void {
    this.selectIcon(null);
    this.selectedCategory.set('none');
  }

  requestSave(): void {
    if (!this.isDirty() || this.saving()) return;
    this.saveError.set(null);
    this.showSaveConfirm.set(true);
  }

  cancelSaveConfirm(): void {
    if (this.saving()) return;
    this.showSaveConfirm.set(false);
  }

  confirmSaveChanges(): void {
    const d = this.draft();
    if (!d) return;

    this.saving.set(true);
    this.saveError.set(null);

    const payload: TrainerProfile = {
      trainerName: d.trainerName,
      favoriteType: d.favoriteType,
      // Not user-editable — the server always keeps whatever's already on
      // file (or 'Beginner' for a brand-new profile) regardless of what's
      // sent here. Included only to satisfy the TrainerProfile shape.
      experienceLevel: d.experienceLevel,
      firstName: d.firstName,
      lastName: d.lastName,
      dateOfBirth: d.dateOfBirth.toISOString(),
      country: d.country,
      avatarPokemonId: d.avatarPokemonId,
      teamName: d.teamName.trim() || null,
      // The server ignores/overwrites acceptedPolicy on an update with
      // whatever's already on file for an existing profile (see
      // routes/profile.js) — sending the already-known value here is just to
      // satisfy the TrainerProfile shape, it changes nothing server-side.
      acceptedPolicy: d.acceptedPolicy,
      marketingEmailsOptIn: d.marketingEmailsOptIn,
    };

    this.profileService.saveProfile(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(d);
        this.showSavedToast.set(true);
        setTimeout(() => this.showSavedToast.set(false), 2400);
        this.closeModal();
      },
      error: (err) => {
        this.saving.set(false);
        this.showSaveConfirm.set(false);
        this.saveError.set(
          err?.status === 400 && err?.error?.message
            ? err.error.message
            : 'Something went wrong saving your profile. Please try again.',
        );
      },
    });
  }
}
