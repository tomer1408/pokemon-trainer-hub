import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { COUNTRIES } from './countries';
import { EXPERIENCE_LEVELS, ExperienceLevel, POKEMON_TYPES, PokemonType } from './trainer-profile-options';

interface TrainerProfile {
  trainerName: string;
  favoriteType: PokemonType;
  experienceLevel: ExperienceLevel;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  country: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('pokemon-trainer-hub-client');
  protected readonly countries = COUNTRIES;
  protected readonly pokemonTypes = POKEMON_TYPES;
  protected readonly experienceLevels = EXPERIENCE_LEVELS;

  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  protected readonly apiResult = signal<string | null>(null);

  // null = not checked yet, false = checked, no profile (needs onboarding), TrainerProfile = has one
  protected readonly profile = signal<TrainerProfile | false | null>(null);

  protected readonly form = signal<TrainerProfile>({
    trainerName: '',
    favoriteType: POKEMON_TYPES[0],
    experienceLevel: EXPERIENCE_LEVELS[0],
    firstName: '',
    lastName: '',
    dateOfBirth: new Date(),
    country: COUNTRIES[0],
  });

  constructor() {
    this.auth.isAuthenticated$.subscribe((isAuthenticated) => {
      if (isAuthenticated) {
        this.fetchProfile();
      }
    });
  }

  login(): void {
    this.auth.loginWithRedirect().subscribe();
  }

  logout(): void {
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } }).subscribe();
  }

  callPrivateApi(): void {
    this.apiResult.set('Loading...');
    this.http.get('http://localhost:3000/api/private').subscribe({
      next: (res) => this.apiResult.set(JSON.stringify(res)),
      error: (err) => this.apiResult.set(`Error ${err.status}: ${err.message}`),
    });
  }

  private fetchProfile(): void {
    this.http.get<TrainerProfile>('http://localhost:3000/api/profile').subscribe({
      next: (profile) => this.profile.set({ ...profile, dateOfBirth: new Date(profile.dateOfBirth) }),
      error: (err) => {
        if (err.status === 404) {
          this.profile.set(false);
        }
      },
    });
  }

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
    this.http.post<TrainerProfile>('http://localhost:3000/api/profile', this.form()).subscribe({
      next: (profile) => this.profile.set({ ...profile, dateOfBirth: new Date(profile.dateOfBirth) }),
    });
  }
}
