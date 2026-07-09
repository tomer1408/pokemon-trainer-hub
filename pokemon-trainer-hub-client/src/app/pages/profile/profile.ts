import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { COUNTRIES } from '../../countries';
import { EXPERIENCE_LEVELS, ExperienceLevel, POKEMON_TYPES, PokemonType } from '../../trainer-profile-options';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { TeamService } from '../../core/team';
import { FavoritesService } from '../../core/favorites';
import { PokemonService, PokemonDetail } from '../../core/pokemon';
import { PROFILE_ICON_POKEMON_IDS } from '../../shared/profile-icons';
import { getTeamPower, getTeamTier } from '../../shared/team-power';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';

interface ProfileDraft {
  trainerName: string;
  favoriteType: PokemonType;
  experienceLevel: ExperienceLevel;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  country: string;
  avatarPokemonId: number | null;
}

type Mode = 'view' | 'edit';

// Matches My Profile.dc.html. The "Profile Icon" picker uses real Pokémon
// (real sprites/ids, saved to the real avatarPokemonId column) instead of the
// mockup's fictional 9-type avatar picker — same real-data approach used in
// Onboarding.
@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile {
  private readonly profileService = inject(ProfileService);
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly pokemonService = inject(PokemonService);
  protected readonly theme = inject(ThemeService);

  protected readonly iconOptions = toSignal(
    forkJoin(PROFILE_ICON_POKEMON_IDS.map((id) => this.pokemonService.getById(id))).pipe(
      map((results) => results.filter((p): p is PokemonDetail => p !== null)),
    ),
    { initialValue: [] as PokemonDetail[] },
  );

  protected readonly countries = COUNTRIES;
  protected readonly pokemonTypes = POKEMON_TYPES;
  protected readonly experienceLevels = EXPERIENCE_LEVELS;

  private readonly loadedProfile = toSignal(this.profileService.getProfile());
  protected readonly isLoading = computed(() => this.loadedProfile() === undefined);

  protected readonly mode = signal<Mode>('view');
  protected readonly saved = signal<ProfileDraft | null>(null);
  protected readonly draft = signal<ProfileDraft | null>(null);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly team = toSignal(this.teamService.getTeam(), { initialValue: [] });
  protected readonly favorites = toSignal(this.favoritesService.getFavorites(), { initialValue: [] });

  protected readonly teamCount = computed(() => this.team().length);
  protected readonly hasTeam = computed(() => this.teamCount() > 0);
  protected readonly teamPower = computed(() => getTeamPower(this.team()));
  protected readonly trainerLevel = computed(() => getTeamTier(this.teamCount()));
  protected readonly favoritesCount = computed(() => this.favorites().length);

  protected readonly avatarSprite = computed(() => {
    const id = this.saved()?.avatarPokemonId;
    if (id == null) return null;
    return this.iconOptions().find((p) => p.id === id)?.spriteUrl ?? null;
  });

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
    return s.dateOfBirth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  startEdit(): void {
    const s = this.saved();
    if (!s) return;
    this.draft.set({ ...s });
    this.saveError.set(null);
    this.mode.set('edit');
  }

  cancelEdit(): void {
    this.mode.set('view');
    this.draft.set(null);
    this.saveError.set(null);
  }

  updateDraft(field: 'trainerName' | 'firstName' | 'lastName' | 'country', value: string): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, [field]: value });
  }

  updateFavoriteType(value: PokemonType): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, favoriteType: value });
  }

  updateExperienceLevel(value: ExperienceLevel): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, experienceLevel: value });
  }

  selectIcon(pokemonId: number): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, avatarPokemonId: pokemonId });
  }

  get dobInputValue(): string {
    return this.draft()?.dateOfBirth.toISOString().split('T')[0] ?? '';
  }

  updateDob(value: string): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, dateOfBirth: new Date(value) });
  }

  saveChanges(): void {
    const d = this.draft();
    if (!d) return;

    this.saving.set(true);
    this.saveError.set(null);

    const payload: TrainerProfile = {
      trainerName: d.trainerName,
      favoriteType: d.favoriteType,
      experienceLevel: d.experienceLevel,
      firstName: d.firstName,
      lastName: d.lastName,
      dateOfBirth: d.dateOfBirth.toISOString(),
      country: d.country,
      avatarPokemonId: d.avatarPokemonId,
    };

    this.profileService.saveProfile(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(d);
        this.mode.set('view');
        this.draft.set(null);
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set('Something went wrong saving your profile. Please try again.');
      },
    });
  }
}
