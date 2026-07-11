import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';
import { AgeRange } from '../shared/age-range';

export interface TrainerProfile {
  trainerName: string;
  favoriteType: string;
  experienceLevel: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
  // Real Pokédex id of the trainer's chosen profile icon, or null if they
  // haven't picked one.
  avatarPokemonId: number | null;
  // The trainer's custom name for their Dream Team, or null if not set.
  teamName: string | null;
  // Only present on responses (GET/POST) — never sent by the client on save.
  createdAt?: string;
  // Real, server-side flag — not client storage — so it's tied to the
  // actual logged-in user instead of one browser's localStorage.
  hasCompletedStarterQuiz?: boolean;
  // Consent, set once at first profile creation. acceptedPolicyAt/policyVersion
  // are server-decided (never sent by the client) — see routes/profile.js.
  acceptedPolicy: boolean;
  acceptedPolicyAt?: string;
  policyVersion?: string;
  marketingEmailsOptIn: boolean;
  // Response-only — derived server-side from dateOfBirth on every GET/POST,
  // never stored and never sent by the client.
  ageRange?: AgeRange | null;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  // Returns null instead of erroring when the trainer hasn't completed
  // onboarding yet (server responds 404) — callers can fall back to the
  // Auth0 profile's display name in that case.
  getProfile(): Observable<TrainerProfile | null> {
    return this.http
      .get<TrainerProfile>(`${API_BASE}/profile`)
      .pipe(catchError(() => of(null)));
  }

  // Does NOT swallow errors — the Callback page needs to tell "no profile
  // yet" (404, go to onboarding) apart from a real failure (go to an error
  // screen with retry), which getProfile() above can't distinguish.
  getProfileStrict(): Observable<TrainerProfile> {
    return this.http.get<TrainerProfile>(`${API_BASE}/profile`);
  }

  // POST /api/profile is an upsert server-side — used by both Onboarding
  // (first save) and the Profile page (edits) against the same endpoint.
  saveProfile(profile: TrainerProfile): Observable<TrainerProfile> {
    return this.http.post<TrainerProfile>(`${API_BASE}/profile`, profile);
  }

  // Real, server-side record that this trainer finished the Starter Quiz —
  // the user is identified from the JWT server-side, never sent from here.
  markStarterQuizCompleted(): Observable<boolean> {
    return this.http.patch(`${API_BASE}/profile/starter-quiz`, {}).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
