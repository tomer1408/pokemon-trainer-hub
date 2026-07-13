import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';

export interface BattleRoundDetail {
  round: number;
  yourPokemonId: number;
  yourPokemonName: string;
  yourType: string;
  oppPokemonId: number;
  oppPokemonName: string;
  oppType: string;
  winner: 'you' | 'opp';
  reason: string;
}

// The trainer's full Dream Team roster as it stood at match time — not just
// whichever members ended up used in a round (the bench matters too, and the
// team can change later), so this is captured per-match rather than read
// live from the current team when viewing history.
export interface BattleTeamSnapshotMember {
  pokemonId: number;
  pokemonName: string;
  spriteUrl: string | null;
  types: string[];
  power: number;
}

export interface BattleMatchRecord {
  id: number;
  opponentName: string;
  difficulty: string;
  rounds: number;
  roundsPlayed: number;
  opponentType: string;
  luckFactor: string;
  result: 'win' | 'loss';
  yourWins: number;
  oppWins: number;
  roundDetails: BattleRoundDetail[];
  teamSnapshot: BattleTeamSnapshotMember[];
  createdAt: string;
}

export interface RecordMatchPayload {
  opponentName: string;
  difficulty: string;
  rounds: number;
  roundsPlayed: number;
  opponentType: string;
  luckFactor: string;
  result: 'win' | 'loss';
  yourWins: number;
  oppWins: number;
  roundDetails: BattleRoundDetail[];
  teamSnapshot: BattleTeamSnapshotMember[];
}

@Injectable({ providedIn: 'root' })
export class BattleHistoryService {
  private readonly http = inject(HttpClient);

  getHistory(): Observable<BattleMatchRecord[]> {
    return this.http
      .get<BattleMatchRecord[]>(`${API_BASE}/battle-history`)
      .pipe(catchError(() => of([])));
  }

  // Fire-and-forget from the caller's perspective — a failed save never
  // blocks or errors the match-over screen, Battle itself has nothing
  // riding on this succeeding.
  recordMatch(payload: RecordMatchPayload): Observable<boolean> {
    return this.http.post(`${API_BASE}/battle-history`, payload).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
