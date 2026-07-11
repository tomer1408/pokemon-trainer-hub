import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { API_BASE } from './api-base';
import { PokemonSummary } from './pokemon';
import { PokemonTypeName } from '../shared/pokemon-types';

export interface AssistantRecommendation {
  type: PokemonTypeName;
  reasoning: string;
  pokemon: PokemonSummary | null;
}

// Talks to the real, server-side LLM-backed assistant (services/
// assistantService.js on the Express server) — the model only ever decides
// a type + reasoning; the actual Pokémon returned is always real PokeAPI
// data, never something the model invented.
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);

  analyzeTeam(): Observable<AssistantRecommendation | null> {
    return this.http
      .post<AssistantRecommendation>(`${API_BASE}/assistant/analyze`, {})
      .pipe(catchError(() => of(null)));
  }

  query(text: string): Observable<AssistantRecommendation | null> {
    return this.http
      .post<AssistantRecommendation>(`${API_BASE}/assistant/query`, { text })
      .pipe(catchError(() => of(null)));
  }
}
