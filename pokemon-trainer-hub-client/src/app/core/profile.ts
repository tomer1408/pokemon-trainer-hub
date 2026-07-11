import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';
import { AgeRange } from '../shared/age-range';

const TEAM_NAME_SAVE_FALLBACK_MESSAGE = 'Could not save the team name. Please try again.';

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
  // Real, server-side best streak for the "Who's That Pokémon?" quiz — not
  // browser localStorage, tied to the actual logged-in user. Response-only;
  // updated via updateWhosThatBestStreak() below, never sent on saveProfile().
  whosThatBestStreak?: number;
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

  // Lightweight alternative to saveProfile() for callers that only have a
  // name in hand (e.g. the AI Team Name Generator on My Team) — saves
  // without needing to fetch and resend the whole profile. The server
  // re-validates the name regardless of whether it came from free typing or
  // an AI suggestion.
  updateTeamName(name: string): Observable<{ ok: true } | { ok: false; message: string }> {
    return this.http.patch(`${API_BASE}/profile/team-name`, { name }).pipe(
      map((): { ok: true } | { ok: false; message: string } => ({ ok: true })),
      catchError((err: HttpErrorResponse) =>
        of({ ok: false as const, message: err.error?.message ?? TEAM_NAME_SAVE_FALLBACK_MESSAGE }),
      ),
    );
  }

  // Real, server-side record of a new "Who's That Pokémon?" streak — the
  // server itself only ever keeps the higher of this and what's already on
  // file, so this is safe to call every time a round ends, not just on an
  // actual new best.
  updateWhosThatBestStreak(streak: number): Observable<boolean> {
    return this.http.patch(`${API_BASE}/profile/whos-that-streak`, { streak }).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
