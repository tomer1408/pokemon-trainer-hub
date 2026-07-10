import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, map, catchError, of } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { POKEMON_TYPES, TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
// The app's real Dream Team cap — same value used everywhere else (Home,
// My Team, Manage Team, Battle), just not extracted into one shared
// constant anywhere yet.
const MAX_TEAM_SIZE = 5;

interface HeroCard {
  name: string;
  dex: string;
  type: string;
  typeColor: string;
  spriteUrl: string | null;
  hp: number;
  attack: number;
  power: number;
  top: string;
  left: string;
  driftAnimation: string;
  driftDelay: string;
  zIndex: number;
}

// Fixed layout slots for the 4 showcase cards — the Pokémon data itself
// (name, sprite, stats, type) is fetched live below, only position/timing is
// hardcoded here.
const HERO_SLOTS = [
  { pokemonName: 'pikachu', top: '2%', left: '34%', driftAnimation: 'driftA', driftDelay: '0s', zIndex: 3 },
  { pokemonName: 'charmander', top: '20%', left: '74%', driftAnimation: 'driftB', driftDelay: '0.6s', zIndex: 4 },
  { pokemonName: 'squirtle', top: '55%', left: '32%', driftAnimation: 'driftC', driftDelay: '1.1s', zIndex: 2 },
  { pokemonName: 'articuno', top: '58%', left: '76%', driftAnimation: 'driftD', driftDelay: '0.3s', zIndex: 1 },
];

interface RawPokeApiPokemon {
  id: number;
  name: string;
  base_experience: number;
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

interface StatCell {
  value: string;
  label: string;
}

@Component({
  selector: 'app-landing',
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  // Purely decorative starfield — position/timing only, no data behind it.
  protected readonly stars = Array.from({ length: 32 }, (_, i) => {
    const h = (i * 2654435761) >>> 0;
    return {
      top: (h % 94) + 2,
      left: ((h >> 8) % 96) + 2,
      size: 1.5 + ((h >> 16) % 3),
      duration: 3 + ((h >> 4) % 5),
      delay: (h % 40) / 10,
      color: i % 3 === 0 ? '#5EEAD4' : '#A78BFA',
    };
  });

  // Landing renders before login, so it can't call our own /api/pokemon (that
  // route requires a valid Auth0 JWT) — instead it hits the public,
  // unauthenticated PokeAPI directly from the browser to show 4 real
  // Pokémon: real name, dex number, sprite, base stats, and a type color
  // pulled from the same TYPE_COLORS palette used on every other page.
  protected readonly heroCards = toSignal(
    forkJoin(
      HERO_SLOTS.map((slot) =>
        this.http.get<RawPokeApiPokemon>(`${POKEAPI_BASE}/pokemon/${slot.pokemonName}`).pipe(
          map((p): HeroCard => {
            const type = p.types[0].type.name as PokemonTypeName;
            return {
              name: capitalize(p.name),
              dex: `#${String(p.id).padStart(4, '0')}`,
              type: capitalize(type),
              typeColor: TYPE_COLORS[type] ?? TYPE_COLORS['normal'],
              spriteUrl: p.sprites.other?.['official-artwork']?.front_default ?? p.sprites.front_default,
              hp: statValue(p.stats, 'hp'),
              attack: statValue(p.stats, 'attack'),
              power: p.base_experience,
              top: slot.top,
              left: slot.left,
              driftAnimation: slot.driftAnimation,
              driftDelay: slot.driftDelay,
              zIndex: slot.zIndex,
            };
          }),
          catchError(() => of(null)),
        ),
      ),
    ).pipe(map((cards) => cards.filter((c): c is HeroCard => c !== null))),
    { initialValue: [] as HeroCard[] },
  );

  // The real total species count, read from PokeAPI's own list endpoint (its
  // `count` field) instead of a hardcoded guess. Types/Team-slots are real,
  // static facts about this app (the 18 canonical types it tracks, and its
  // 5-slot Dream Team cap) — known immediately, no request needed.
  private readonly realSpeciesCount = toSignal(
    this.http.get<{ count: number }>(`${POKEAPI_BASE}/pokemon?limit=1`).pipe(
      map((res) => res.count),
      catchError(() => of(null)),
    ),
    { initialValue: null as number | null },
  );

  // Animated 0 → real-value count-up, matching the mockup's easing —
  // purely a visual flourish, the values it counts up to are all real.
  protected readonly displayedCounts = signal<[number, number, number]>([0, 0, MAX_TEAM_SIZE]);

  constructor() {
    effect((onCleanup) => {
      const species = this.realSpeciesCount();
      if (species == null) return;

      const targets: [number, number, number] = [species, POKEMON_TYPES.length, MAX_TEAM_SIZE];
      const duration = 1300;
      const start = Date.now();
      const timer = setInterval(() => {
        const t = Math.min(1, (Date.now() - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        this.displayedCounts.set([
          Math.round(targets[0] * eased),
          Math.round(targets[1] * eased),
          Math.round(targets[2] * eased),
        ]);
        if (t >= 1) clearInterval(timer);
      }, 40);

      onCleanup(() => clearInterval(timer));
    });
  }

  protected readonly statCells = computed<StatCell[]>(() => {
    const [species, types, slots] = this.displayedCounts();
    return [
      { value: `${species}`, label: 'Pokémon' },
      { value: `${types}`, label: 'Types' },
      { value: `${slots}`, label: 'Team slots' },
    ];
  });

  // Bottom ticker — every real type this app tracks, doubled so the
  // marquee's -50% translateX loop is seamless.
  protected readonly marqueeItems = [...POKEMON_TYPES, ...POKEMON_TYPES].map((t) => ({
    label: capitalize(t),
    color: TYPE_COLORS[t],
  }));

  login(): void {
    this.auth.loginWithRedirect().subscribe();
  }
}
