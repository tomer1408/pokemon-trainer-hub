import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';
import { PokemonStat } from './team';

export interface FavoritePokemon {
  pokemonId: number;
  pokemonName: string;
  spriteUrl: string | null;
  addedAt: string;
  stats: PokemonStat[];
  types: string[];
  baseExperience: number;
}

// Mirrors TeamService — same shape, same fallback-on-error pattern — but
// against /api/favorites, which has no 5-item cap (routes/favorites.js).
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly http = inject(HttpClient);

  getFavorites(): Observable<FavoritePokemon[]> {
    return this.http
      .get<FavoritePokemon[]>(`${API_BASE}/favorites`)
      .pipe(catchError(() => of([])));
  }

  addFavorite(pokemonId: number): Observable<boolean> {
    return this.http.post(`${API_BASE}/favorites/${pokemonId}`, {}).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  removeFavorite(pokemonId: number): Observable<boolean> {
    return this.http.delete<void>(`${API_BASE}/favorites/${pokemonId}`).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
