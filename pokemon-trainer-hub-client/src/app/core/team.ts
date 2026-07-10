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
  position: number;
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

  // Does NOT swallow errors — unlike getTeam() above, callers that need to
  // tell "genuinely empty team" apart from "the request actually failed"
  // (e.g. Home's error state) should use this instead.
  getTeamStrict(): Observable<DreamTeamMember[]> {
    return this.http.get<DreamTeamMember[]>(`${API_BASE}/team`);
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

  // Persists a drag-and-drop reorder. `pokemonIds` must be exactly the
  // current team's ids, just resequenced — the server identifies the user
  // from the JWT and rejects anything that isn't a pure reshuffle, so this
  // call can never accidentally add/remove/favorite a member.
  reorderTeam(pokemonIds: number[]): Observable<boolean> {
    return this.http.patch(`${API_BASE}/team/reorder`, { pokemonIds }).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  // Backs Manage My Team's Save Changes — one real backend transaction (PUT
  // /api/team) instead of separate remove/add/reorder calls from the client.
  // `pokemonIds` is the FULL target team in its final order; the server
  // diffs it against the current team itself and applies every add, remove,
  // and position change atomically. Returns the saved team as read back from
  // the database, so the caller can trust it as the new authoritative state
  // instead of assuming the draft it sent is what actually landed.
  saveTeam(pokemonIds: number[]): Observable<{ ok: true; team: DreamTeamMember[] } | { ok: false; message: string }> {
    return this.http.put<DreamTeamMember[]>(`${API_BASE}/team`, { pokemonIds }).pipe(
      map((team): { ok: true; team: DreamTeamMember[] } => ({ ok: true, team })),
      catchError((err: HttpErrorResponse) =>
        of({ ok: false as const, message: err.error?.message ?? 'Could not save team changes. Please try again.' }),
      ),
    );
  }

  // Backs the Team Swap Modal — one real backend transaction (POST
  // /api/team/swap) instead of a separate remove+add from the client.
  swapTeamMember(removePokemonId: number, addPokemonId: number): Observable<AddToTeamResult> {
    return this.http.post(`${API_BASE}/team/swap`, { removePokemonId, addPokemonId }).pipe(
      map((): AddToTeamResult => ({ ok: true })),
      catchError((err: HttpErrorResponse) => {
        const reason = err.error?.reason === 'DUPLICATE' ? 'DUPLICATE' : 'OTHER';
        return of<AddToTeamResult>({
          ok: false,
          reason,
          message: err.error?.message ?? 'Something went wrong swapping your team.',
        });
      }),
    );
  }
}
