import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { COUNTRIES, countryFlag } from '../../countries';
import { EXPERIENCE_LEVELS, ExperienceLevel, POKEMON_TYPES, PokemonType } from '../../trainer-profile-options';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { AvatarIconsService, AvatarIconOption } from '../../core/avatar-icons';
import { AVATAR_CATEGORY_ORDER, AVATAR_CATEGORY_LABELS } from '../../shared/avatar-categories';
import { calculateAgeRange, isBelowMinAge, isFutureDate } from '../../shared/age-range';
import { PolicyModal, PolicyType } from '../../shared/policy-modal/policy-modal';
import { DatePicker } from '../../shared/date-picker/date-picker';

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

// Matches Additional Details.dc.html / Create Trainer Profile.dc.html. Two
// deliberate deviations: Favorite Type keeps this project's real value set
// (4 types — already used by Onboarding/Profile's shared /api/profile field)
// instead of the mockup's own fictional 7-type list, and the "Profile Icon"
// picker uses real Pokémon (real sprites, real ids, saved to a real
// avatarPokemonId column) instead of the mockup's colored placeholder
// circles. Experience Level isn't asked here at all — it's collected later
// from the Profile page instead — but /api/profile still requires it, so
// the form silently submits EXPERIENCE_LEVELS[0] ('Beginner') as a default.
@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, PolicyModal, DatePicker],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
})
export class Onboarding {
  private readonly profileService = inject(ProfileService);
  private readonly avatarIconsService = inject(AvatarIconsService);
  private readonly router = inject(Router);

  protected readonly countries = COUNTRIES;
  protected readonly countryFlag = countryFlag;
  protected readonly pokemonTypes = POKEMON_TYPES;

  protected readonly countryOpen = signal(false);
  protected readonly selectedCountryFlag = computed(() => {
    const match = COUNTRIES.find((c) => c.name === this.form().country);
    return match ? countryFlag(match.code) : '';
  });

  toggleCountryOpen(): void {
    this.countryOpen.update((v) => !v);
  }

  closeCountryOpen(): void {
    this.countryOpen.set(false);
  }

  selectCountry(name: string): void {
    this.updateField('country', name);
    this.closeCountryOpen();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.countryOpen()) this.closeCountryOpen();
  }

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
