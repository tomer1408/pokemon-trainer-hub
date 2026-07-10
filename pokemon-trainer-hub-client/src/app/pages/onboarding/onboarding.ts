import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { COUNTRIES } from '../../countries';
import { EXPERIENCE_LEVELS, ExperienceLevel, POKEMON_TYPES, PokemonType } from '../../trainer-profile-options';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { PokemonService, PokemonDetail } from '../../core/pokemon';
import { PROFILE_ICON_POKEMON_IDS } from '../../shared/profile-icons';

interface OnboardingForm {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
  experienceLevel: ExperienceLevel;
  trainerName: string;
  favoriteType: PokemonType;
  avatarPokemonId: number | null;
  teamName: string;
}

// Matches Additional Details.dc.html. One deliberate deviation: Experience
// Level and Favorite Type keep this project's real value sets (3 levels, 4
// types — already used by Onboarding/Profile's shared /api/profile field)
// instead of the mockup's own fictional labels/9-type list. The "Profile
// Icon" picker uses real Pokémon (real sprites, real ids, saved to a real
// avatarPokemonId column) instead of the mockup's colored placeholder circles.
@Component({
  selector: 'app-onboarding',
  imports: [FormsModule],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
})
export class Onboarding {
  private readonly profileService = inject(ProfileService);
  private readonly pokemonService = inject(PokemonService);
  private readonly router = inject(Router);

  protected readonly countries = COUNTRIES;
  protected readonly pokemonTypes = POKEMON_TYPES;
  protected readonly experienceLevels = EXPERIENCE_LEVELS;

  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  protected readonly form = signal<OnboardingForm>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    country: '',
    experienceLevel: EXPERIENCE_LEVELS[0],
    trainerName: '',
    favoriteType: POKEMON_TYPES[0],
    avatarPokemonId: null,
    teamName: '',
  });

  protected readonly iconOptions = toSignal(
    forkJoin(PROFILE_ICON_POKEMON_IDS.map((id) => this.pokemonService.getById(id))).pipe(
      map((results) => results.filter((p): p is PokemonDetail => p !== null)),
    ),
    { initialValue: [] as PokemonDetail[] },
  );

  // The mockup's own submit button only requires firstName/lastName/trainerName,
  // but the backend (POST /api/profile) rejects the request unless every field
  // is present — so all of them are required here to avoid a guaranteed 400.
  // The profile icon stays optional (not everyone wants to pick one).
  protected readonly canSubmit = computed(() => {
    const f = this.form();
    return !!(f.firstName.trim() && f.lastName.trim() && f.trainerName.trim() && f.dateOfBirth && f.country);
  });

  updateField(
    field: 'firstName' | 'lastName' | 'dateOfBirth' | 'country' | 'trainerName' | 'teamName',
    value: string,
  ): void {
    this.form.set({ ...this.form(), [field]: value });
  }

  updateExperienceLevel(value: ExperienceLevel): void {
    this.form.set({ ...this.form(), experienceLevel: value });
  }

  updateFavoriteType(value: PokemonType): void {
    this.form.set({ ...this.form(), favoriteType: value });
  }

  selectIcon(pokemonId: number): void {
    this.form.set({ ...this.form(), avatarPokemonId: pokemonId });
  }

  submitProfile(): void {
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.submitError.set(null);

    const f = this.form();
    const payload: TrainerProfile = {
      trainerName: f.trainerName,
      favoriteType: f.favoriteType,
      experienceLevel: f.experienceLevel,
      firstName: f.firstName,
      lastName: f.lastName,
      dateOfBirth: new Date(f.dateOfBirth).toISOString(),
      country: f.country,
      avatarPokemonId: f.avatarPokemonId,
      teamName: f.teamName.trim() || null,
    };

    this.profileService.saveProfile(payload).subscribe({
      next: () => this.router.navigateByUrl('/home'),
      error: () => {
        this.submitting.set(false);
        this.submitError.set('Something went wrong saving your profile. Please try again.');
      },
    });
  }
}
