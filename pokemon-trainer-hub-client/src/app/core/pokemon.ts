import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';
import { PokemonStat } from './team';

export interface PokemonSummary {
  id: number;
  name: string;
  baseExperience: number;
  types: string[];
  spriteUrl: string | null;
  // GET /api/pokemon already includes each entry's real stats (it's built
  // from the same fetchPokemonDetail() the single-item route uses) — this
  // was just never declared here since nothing needed it until the Starter
  // Quiz's scoring, which reads it straight off search() results instead of
  // paying for 151 individual getById() calls.
  stats: PokemonStat[];
}

export interface PokemonAbility {
  name: string;
  description: string | null;
}

export interface PokemonMove {
  name: string;
  type: string;
  power: number;
}

export interface PokemonDetail extends PokemonSummary {
  stats: { name: string; value: number }[];
  abilities: PokemonAbility[];
  cry: string | null;
  // Only populated by getById (GET /api/pokemon/:id) — the list endpoint
  // doesn't pay for the extra PokeAPI calls these need.
  height: number;
  weight: number;
  flavorText: string | null;
  weaknesses: string[];
  resistances: string[];
  topMoves: PokemonMove[];
}

export interface PokemonListResponse {
  results: PokemonSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PokemonSearchParams {
  search?: string;
  type?: string;
  sort?: 'id' | 'name' | 'strongest';
  page?: number;
}

export interface TypeMatchup {
  weak: string[];
  resist: string[];
  // Types this type deals double damage TO (offense, not defense).
  strong: string[];
}

export type TypeChart = Record<string, TypeMatchup>;

@Injectable({ providedIn: 'root' })
export class PokemonService {
  private readonly http = inject(HttpClient);

  // Used to power the AI Trainer Assistant's recommendations: the single
  // highest base-experience Pokémon of a given type.
  getStrongestOfType(type: string): Observable<PokemonSummary | null> {
    const params = { type, sort: 'strongest', page: '1' };
    return this.http
      .get<PokemonListResponse>(`${API_BASE}/pokemon`, { params })
      .pipe(
        map((res) => res.results[0] ?? null),
        catchError(() => of(null)),
      );
  }

  // Backs the Explorer page's search/type-filter/sort/pagination — a thin
  // pass-through to GET /api/pokemon's own query params.
  search(params: PokemonSearchParams): Observable<PokemonListResponse> {
    const httpParams: Record<string, string> = { page: String(params.page ?? 1) };
    if (params.search) httpParams['search'] = params.search;
    if (params.type) httpParams['type'] = params.type;
    if (params.sort) httpParams['sort'] = params.sort;

    return this.http
      .get<PokemonListResponse>(`${API_BASE}/pokemon`, { params: httpParams })
      .pipe(catchError(() => of({ results: [], page: 1, pageSize: 20, total: 0 })));
  }

  // Used by Surprise Me (random real dex number) and the Pokémon Detail Modal.
  getById(id: number | string): Observable<PokemonDetail | null> {
    return this.http
      .get<PokemonDetail>(`${API_BASE}/pokemon/${id}`)
      .pipe(catchError(() => of(null)));
  }

  // Used by the avatar icon picker (Onboarding + Profile) — a single request
  // for the whole fixed icon set, using the light detail shape (just the
  // sprite is actually shown) instead of N separate getById() calls that
  // would each pay for flavor text/matchups/abilities/moves nothing needs here.
  getByIds(ids: number[]): Observable<PokemonSummary[]> {
    if (ids.length === 0) return of([]);
    const params = { ids: ids.join(',') };
    return this.http
      .get<PokemonListResponse>(`${API_BASE}/pokemon`, { params })
      .pipe(
        map((res) => res.results),
        catchError(() => of([])),
      );
  }

  // Real weak/resist/strong lists for all 18 types — used by My Team's
  // Battle Readiness / Matchup Analysis cards to compute team-wide type
  // effectiveness from real PokeAPI data instead of an invented type table.
  getTypeChart(): Observable<TypeChart> {
    return this.http.get<TypeChart>(`${API_BASE}/pokemon/type-chart`).pipe(catchError(() => of({})));
  }
}
