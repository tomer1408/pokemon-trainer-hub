import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, map, catchError, of } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

interface HeroCard {
  name: string;
  dex: string;
  type: string;
  spriteUrl: string | null;
  hp: number;
  attack: number;
  speed: number;
  hue: number;
  top: string;
  left: string;
  driftAnimation: string;
  driftDelay: string;
  zIndex: number;
}

// Fixed layout/color slots for the 3 showcase cards — the Pokémon data itself
// (name, sprite, stats) is fetched live below, this part is purely visual.
const HERO_SLOTS = [
  { pokemonName: 'pikachu', hue: 95, top: '2%', left: '8%', driftAnimation: 'driftA', driftDelay: '0s', zIndex: 3 },
  { pokemonName: 'charmander', hue: 25, top: '30%', left: '46%', driftAnimation: 'driftB', driftDelay: '0.6s', zIndex: 2 },
  { pokemonName: 'bulbasaur', hue: 150, top: '58%', left: '4%', driftAnimation: 'driftC', driftDelay: '1.1s', zIndex: 1 },
];

interface RawPokeApiPokemon {
  id: number;
  name: string;
  sprites: {
    front_default: string | null;
    other?: { ['official-artwork']?: { front_default: string | null } };
  };
  types: { type: { name: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statValue(stats: RawPokeApiPokemon['stats'], statName: string): number {
  return stats.find((s) => s.stat.name === statName)?.base_stat ?? 0;
}

@Component({
  selector: 'app-landing',
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  // Landing renders before login, so it can't call our own /api/pokemon (that
  // route requires a valid Auth0 JWT) — instead it hits the public, unauthenticated
  // PokeAPI directly from the browser to show 3 real Pokémon (real name, dex
  // number, sprite, base stats), not the placeholder creatures used earlier.
  protected readonly heroCards = toSignal(
    forkJoin(
      HERO_SLOTS.map((slot) =>
        this.http.get<RawPokeApiPokemon>(`${POKEAPI_BASE}/pokemon/${slot.pokemonName}`).pipe(
          map(
            (p): HeroCard => ({
              name: capitalize(p.name),
              dex: `#${String(p.id).padStart(4, '0')}`,
              type: capitalize(p.types[0].type.name),
              // Official artwork is a large, clean render (vs. the tiny 96x96
              // pixel-art front sprite) — falls back to the sprite if missing.
              spriteUrl: p.sprites.other?.['official-artwork']?.front_default ?? p.sprites.front_default,
              hp: statValue(p.stats, 'hp'),
              attack: statValue(p.stats, 'attack'),
              speed: statValue(p.stats, 'speed'),
              hue: slot.hue,
              top: slot.top,
              left: slot.left,
              driftAnimation: slot.driftAnimation,
              driftDelay: slot.driftDelay,
              zIndex: slot.zIndex,
            }),
          ),
          catchError(() => of(null)),
        ),
      ),
    ).pipe(map((cards) => cards.filter((c): c is HeroCard => c !== null))),
    { initialValue: [] },
  );

  login(): void {
    this.auth.loginWithRedirect().subscribe();
  }
}
