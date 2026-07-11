import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';
import { PokemonSummary } from './pokemon';
import { PokemonTypeName } from '../shared/pokemon-types';

export interface AssistantRecommendation {
  type: PokemonTypeName;
  reasoning: string;
  pokemon: PokemonSummary | null;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatReply {
  text: string;
  // Only ever real PokeAPI data (see services/assistantService.js) — null
  // when the reply doesn't center on one specific Pokémon.
  pokemon: PokemonSummary | null;
}

export type TeamNameStyle = 'Epic' | 'Competitive' | 'Mysterious' | 'Cute' | 'Funny';

export const TEAM_NAME_STYLES: TeamNameStyle[] = ['Epic', 'Competitive', 'Mysterious', 'Cute', 'Funny'];

export interface TeamNameSuggestionsResponse {
  names: string[];
  // 'fallback' means Gemini was unavailable/invalid/rate-limited and the
  // server's deterministic, non-AI generator produced these instead — the
  // feature still works, just without real LLM input.
  source?: 'ai' | 'fallback';
}

// Carries the server's specific error message through (e.g. "hit today's AI
// usage limit") instead of collapsing every failure into a generic string.
export type AssistantResult<T> = { ok: true; value: T } | { ok: false; message: string };

const FALLBACK_ERROR_MESSAGE = 'The AI assistant is unavailable right now. Please try again later.';

function toErrorResult(err: HttpErrorResponse): AssistantResult<never> {
  const message = typeof err.error?.message === 'string' ? err.error.message : FALLBACK_ERROR_MESSAGE;
  return { ok: false, message };
}

// Talks to the real, server-side LLM-backed assistant (services/
// assistantService.js on the Express server) — the model only ever decides
// a type + reasoning; the actual Pokémon returned is always real PokeAPI
// data, never something the model invented.
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);

  analyzeTeam(): Observable<AssistantResult<AssistantRecommendation>> {
    return this.http.post<AssistantRecommendation>(`${API_BASE}/assistant/analyze`, {}).pipe(
      map((value) => ({ ok: true as const, value })),
      catchError((err: HttpErrorResponse) => of(toErrorResult(err))),
    );
  }

  query(text: string): Observable<AssistantResult<AssistantRecommendation>> {
    return this.http.post<AssistantRecommendation>(`${API_BASE}/assistant/query`, { text }).pipe(
      map((value) => ({ ok: true as const, value })),
      catchError((err: HttpErrorResponse) => of(toErrorResult(err))),
    );
  }

  // Backs the global floating chat widget — open-ended, multi-turn Q&A,
  // distinct from the structured type-recommendation calls above.
  chat(messages: ChatTurn[]): Observable<AssistantResult<ChatReply>> {
    return this.http.post<ChatReply>(`${API_BASE}/assistant/chat`, { messages }).pipe(
      map((value) => ({ ok: true as const, value })),
      catchError((err: HttpErrorResponse) => of(toErrorResult(err))),
    );
  }

  // The server always fetches the current user's real Dream Team itself
  // (from the JWT) before calling the model — only the chosen style is
  // sent from here, never any team/Pokémon data.
  generateTeamNames(style: TeamNameStyle): Observable<AssistantResult<TeamNameSuggestionsResponse>> {
    return this.http.post<TeamNameSuggestionsResponse>(`${API_BASE}/assistant/team-name`, { style }).pipe(
      map((value) => ({ ok: true as const, value })),
      catchError((err: HttpErrorResponse) => of(toErrorResult(err))),
    );
  }
}
