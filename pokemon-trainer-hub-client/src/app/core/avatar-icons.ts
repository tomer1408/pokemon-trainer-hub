import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { API_BASE } from './api-base';

export interface AvatarIconOption {
  pokemonId: number;
  name: string;
  category: string;
  spriteUrl: string;
}

// Real, curated icon set seeded once into our own DB
// (pokemon-trainer-hub-server/scripts/seed-avatar-icons.js) — unlike every
// other Pokémon-data fetch in this app, this never touches PokeAPI at
// request time at all.
@Injectable({ providedIn: 'root' })
export class AvatarIconsService {
  private readonly http = inject(HttpClient);

  getAvatarIcons(): Observable<AvatarIconOption[]> {
    return this.http
      .get<AvatarIconOption[]>(`${API_BASE}/avatar-icons`)
      .pipe(catchError(() => of([])));
  }
}
