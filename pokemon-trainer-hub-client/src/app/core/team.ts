import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';

// Mirrors the 409 body shape the server sends for addToTeam's business-logic
// failures (routes/team.js: DUPLICATE | TEAM_FULL), so callers can react to
// "team is full" specifically (e.g. open the Team Swap Modal) instead of
// treating every failure the same way.
export type AddToTeamResult =
  | { ok: true }
  | { ok: false; reason: 'DUPLICATE' | 'TEAM_FULL' | 'OTHER'; message: string };

export interface PokemonStat {
  name: string;
  value: number;
}

export interface DreamTeamMember {
  pokemonId: number;
  pokemonName: string;
  spriteUrl: string | null;
  addedAt: string;
  stats: PokemonStat[];
  types: string[];
  baseExperience: number;
}

@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly http = inject(HttpClient);

  // Falls back to an empty team (rather than erroring) so a transient API
  // problem doesn't take down the whole Assistant screen — it just shows
  // as an empty Dream Team.
  getTeam(): Observable<DreamTeamMember[]> {
    return this.http.get<DreamTeamMember[]>(`${API_BASE}/team`).pipe(catchError(() => of([])));
  }

  addToTeam(pokemonId: number): Observable<AddToTeamResult> {
    return this.http.post(`${API_BASE}/team/${pokemonId}`, {}).pipe(
      map((): AddToTeamResult => ({ ok: true })),
      catchError((err: HttpErrorResponse) => {
        const reason = err.error?.reason === 'DUPLICATE' || err.error?.reason === 'TEAM_FULL'
          ? err.error.reason
          : 'OTHER';
        return of<AddToTeamResult>({
          ok: false,
          reason,
          message: err.error?.message ?? 'Something went wrong adding this Pokémon.',
        });
      }),
    );
  }

  removeFromTeam(pokemonId: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/team/${pokemonId}`);
  }
}
