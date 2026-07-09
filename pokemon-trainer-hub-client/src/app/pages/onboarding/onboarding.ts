import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { COUNTRIES } from '../../countries';
import { EXPERIENCE_LEVELS, ExperienceLevel, POKEMON_TYPES, PokemonType } from '../../trainer-profile-options';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { ThemeService } from '../../shared/theme';

interface OnboardingForm {
  trainerName: string;
  favoriteType: PokemonType;
  experienceLevel: ExperienceLevel;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  country: string;
}

@Component({
  selector: 'app-onboarding',
  imports: [FormsModule],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
})
export class Onboarding {
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly countries = COUNTRIES;
  protected readonly pokemonTypes = POKEMON_TYPES;
  protected readonly experienceLevels = EXPERIENCE_LEVELS;

  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  protected readonly form = signal<OnboardingForm>({
    trainerName: '',
    favoriteType: POKEMON_TYPES[0],
    experienceLevel: EXPERIENCE_LEVELS[0],
    firstName: '',
    lastName: '',
    dateOfBirth: new Date(2000, 0, 1),
    country: COUNTRIES[0],
  });

  protected readonly canSubmit = computed(() => {
    const f = this.form();
    return !!(f.trainerName.trim() && f.firstName.trim() && f.lastName.trim() && f.country);
  });

  updateForm(field: 'trainerName' | 'firstName' | 'lastName' | 'country', value: string): void {
    this.form.set({ ...this.form(), [field]: value });
  }

  updateFavoriteType(value: PokemonType): void {
    this.form.set({ ...this.form(), favoriteType: value });
  }

  updateExperienceLevel(value: ExperienceLevel): void {
    this.form.set({ ...this.form(), experienceLevel: value });
  }

  // <input type="date"> emits/expects "yyyy-MM-dd" strings, not Date objects,
  // so this is the one field that needs its own conversion in both directions.
  get dateOfBirthInputValue(): string {
    return this.form().dateOfBirth.toISOString().split('T')[0];
  }

  updateDateOfBirth(value: string): void {
    this.form.set({ ...this.form(), dateOfBirth: new Date(value) });
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
      dateOfBirth: f.dateOfBirth.toISOString(),
      country: f.country,
    };

    this.profileService.saveProfile(payload).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: () => {
        this.submitting.set(false);
        this.submitError.set('Something went wrong saving your profile. Please try again.');
      },
    });
  }
}
