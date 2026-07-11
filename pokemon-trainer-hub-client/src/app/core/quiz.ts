import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { API_BASE } from './api-base';

export interface QuizPokemonOption {
  id: number;
  name: string;
  types: string[];
}

export interface QuizTarget extends QuizPokemonOption {
  spriteUrl: string | null;
  baseExperience: number;
}

export interface QuizRound {
  target: QuizTarget;
  // Always includes the real target Pokémon plus 3 real distractors, shuffled
  // server-side — every option here resolves to an actual PokeAPI Pokémon.
  options: QuizPokemonOption[];
}

// Backs the "Who's That Pokémon?" quiz — every round is fetched fresh from
// the server (services/pokeapi.js), never generated client-side, so the
// target and every option are always real Pokémon.
@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly http = inject(HttpClient);

  getRound(): Observable<QuizRound | null> {
    return this.http.get<QuizRound>(`${API_BASE}/quiz/round`).pipe(catchError(() => of(null)));
  }
}
