import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '@auth0/auth0-angular';
import { of } from 'rxjs';
import { POKEMON_TYPES, TYPE_COLORS } from '../../shared/pokemon-types';
import { Landing } from './landing';

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const HERO_NAMES = ['pikachu', 'charmander', 'squirtle', 'articuno'];

describe('Landing', () => {
  let httpMock: HttpTestingController;
  let loginWithRedirect: ReturnType<typeof vi.fn>;

  function rawPokemon(name: string, id: number) {
    return {
      id,
      name,
      base_experience: 112,
      sprites: { front_default: 'fallback.png', other: { 'official-artwork': { front_default: 'artwork.png' } } },
      types: [{ type: { name: 'electric' } }],
      stats: [{ base_stat: 35, stat: { name: 'hp' } }, { base_stat: 55, stat: { name: 'attack' } }],
    };
  }

  function setup() {
    loginWithRedirect = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { loginWithRedirect } },
      ],
    });
    const fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
    return fixture;
  }

  function flushHeroRequests(fail: string[] = []) {
    HERO_NAMES.forEach((name, i) => {
      const req = httpMock.expectOne(`${POKEAPI_BASE}/pokemon/${name}`);
      if (fail.includes(name)) {
        req.flush('error', { status: 500, statusText: 'Server Error' });
      } else {
        req.flush(rawPokemon(name, i + 1));
      }
    });
  }

  function flushCountRequest(count = 1302) {
    httpMock.expectOne(`${POKEAPI_BASE}/pokemon?limit=1`).flush({ count });
  }

  afterEach(() => httpMock.verify());

  it('maps each real PokeAPI hero into name/dex/type/color/sprite/stats', () => {
    const fixture = setup();
    flushHeroRequests();
    flushCountRequest();

    const cards = (fixture.componentInstance as any).heroCards();
    expect(cards.length).toBe(4);
    const pikachu = cards.find((c: any) => c.name === 'Pikachu');
    expect(pikachu.dex).toBe('#0001');
    expect(pikachu.type).toBe('Electric');
    expect(pikachu.typeColor).toBe(TYPE_COLORS['electric']);
    expect(pikachu.spriteUrl).toBe('artwork.png'); // prefers official-artwork
    expect(pikachu.hp).toBe(35);
    expect(pikachu.attack).toBe(55);
    expect(pikachu.power).toBe(112);
  });

  it('falls back to the default sprite when official-artwork is missing', () => {
    const fixture = setup();
    HERO_NAMES.forEach((name, i) => {
      const req = httpMock.expectOne(`${POKEAPI_BASE}/pokemon/${name}`);
      req.flush({ ...rawPokemon(name, i + 1), sprites: { front_default: 'fallback.png' } });
    });
    flushCountRequest();

    const cards = (fixture.componentInstance as any).heroCards();
    expect(cards[0].spriteUrl).toBe('fallback.png');
  });

  it('silently drops a hero card whose individual PokeAPI request fails (never breaks the other 3)', () => {
    const fixture = setup();
    flushHeroRequests(['articuno']);
    flushCountRequest();

    const cards = (fixture.componentInstance as any).heroCards();
    expect(cards.length).toBe(3);
    expect(cards.find((c: any) => c.name === 'Articuno')).toBeUndefined();
  });

  it('animates displayedCounts up to the real species count, real type count, and the fixed team cap', () => {
    vi.useFakeTimers();
    const fixture = setup();
    flushHeroRequests();
    flushCountRequest(1302);
    fixture.detectChanges();

    vi.advanceTimersByTime(1300);
    fixture.detectChanges();

    const [species, types, slots] = (fixture.componentInstance as any).displayedCounts();
    expect(species).toBe(1302);
    expect(types).toBe(POKEMON_TYPES.length);
    expect(slots).toBe(5);
    vi.useRealTimers();
  });

  it('statCells() reflects the current displayedCounts with the right labels', () => {
    const fixture = setup();
    flushHeroRequests();
    flushCountRequest();

    const cells = (fixture.componentInstance as any).statCells();
    expect(cells.map((c: any) => c.label)).toEqual(['Pokémon', 'Types', 'Team slots']);
  });

  it('marqueeItems doubles the real type list for a seamless marquee loop', () => {
    const fixture = setup();
    flushHeroRequests();
    flushCountRequest();

    expect((fixture.componentInstance as any).marqueeItems.length).toBe(POKEMON_TYPES.length * 2);
  });

  it('login() triggers the real Auth0 redirect', () => {
    const fixture = setup();
    flushHeroRequests();
    flushCountRequest();

    fixture.componentInstance.login();

    expect(loginWithRedirect).toHaveBeenCalled();
  });
});
