import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';

export interface PokemonSummary {
  id: number;
  name: string;
  baseExperience: number;
  types: string[];
  spriteUrl: string | null;
}

export interface PokemonDetail extends PokemonSummary {
  stats: { name: string; value: number }[];
  abilities: string[];
  cry: string | null;
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
}
