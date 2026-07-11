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
import { calculateAgeRange, isBelowMinAge, isFutureDate } from '../../shared/age-range';
import { PolicyModal, PolicyType } from '../../shared/policy-modal/policy-modal';

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
  acceptedPolicy: boolean;
  marketingEmailsOptIn: boolean;
}

// Matches Additional Details.dc.html / Create Trainer Profile.dc.html. One
// deliberate deviation: Experience Level and Favorite Type keep this
// project's real value sets (3 levels, 4 types — already used by
// Onboarding/Profile's shared /api/profile field) instead of the mockup's
// own fictional labels/7-type list. The "Profile Icon" picker uses real
// Pokémon (real sprites, real ids, saved to a real avatarPokemonId column)
// instead of the mockup's colored placeholder circles.
@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, PolicyModal],
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
  // Inline field errors only render once a submit attempt has actually been
  // made — canSubmit() below still always gates the button itself.
  protected readonly submitted = signal(false);
  protected readonly openPolicyModal = signal<PolicyType | null>(null);

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
    acceptedPolicy: false,
    marketingEmailsOptIn: false,
  });

  protected readonly iconOptions = toSignal(
    forkJoin(PROFILE_ICON_POKEMON_IDS.map((id) => this.pokemonService.getById(id))).pipe(
      map((results) => results.filter((p): p is PokemonDetail => p !== null)),
    ),
    { initialValue: [] as PokemonDetail[] },
  );

  protected readonly ageRange = computed(() => calculateAgeRange(this.form().dateOfBirth));
  protected readonly isUnderMinAge = computed(() => isBelowMinAge(this.form().dateOfBirth));
  protected readonly isFutureDob = computed(() => isFutureDate(this.form().dateOfBirth));

  protected readonly dobError = computed(() => {
    const dob = this.form().dateOfBirth;
    if (!dob) return 'Date of birth is required';
    if (this.isFutureDob()) return 'Date of birth cannot be in the future.';
    if (this.isUnderMinAge()) return 'You must be at least 13 years old to create a Trainer Hub profile.';
    return '';
  });

  // The mockup's own submit button only requires firstName/lastName/trainerName,
  // but the backend (POST /api/profile) rejects the request unless every field
  // is present — so all of them are required here to avoid a guaranteed 400.
  // The profile icon stays optional (not everyone wants to pick one).
  protected readonly canSubmit = computed(() => {
    const f = this.form();
    return !!(
      f.firstName.trim() &&
      f.lastName.trim() &&
      f.trainerName.trim() &&
      f.dateOfBirth &&
      !this.isFutureDob() &&
      !this.isUnderMinAge() &&
      f.country &&
      f.acceptedPolicy
    );
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

  toggleAcceptedPolicy(): void {
    this.form.set({ ...this.form(), acceptedPolicy: !this.form().acceptedPolicy });
  }

  toggleMarketing(): void {
    this.form.set({ ...this.form(), marketingEmailsOptIn: !this.form().marketingEmailsOptIn });
  }

  showPolicy(type: PolicyType): void {
    this.openPolicyModal.set(type);
  }

  closePolicy(): void {
    this.openPolicyModal.set(null);
  }

  submitProfile(): void {
    this.submitted.set(true);
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
      acceptedPolicy: f.acceptedPolicy,
      marketingEmailsOptIn: f.marketingEmailsOptIn,
    };

    this.profileService.saveProfile(payload).subscribe({
      next: () => this.router.navigateByUrl('/home'),
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(
          err?.status === 400 && err?.error?.message
            ? err.error.message
            : 'Something went wrong saving your profile. Please try again.',
        );
      },
    });
  }
}
