import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { FavoritePokemon, FavoritesService } from './favorites';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FavoritesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getFavorites() falls back to an empty array on error', () => {
    let result: FavoritePokemon[] | undefined;
    service.getFavorites().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/favorites`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toEqual([]);
  });

  it('addFavorite() resolves true on success, false on error', () => {
    let ok: boolean | undefined;
    service.addFavorite(25).subscribe((r) => (ok = r));

    const req = httpMock.expectOne(`${API_BASE}/favorites/25`);
    expect(req.request.method).toBe('POST');
    req.flush({});

    expect(ok).toBe(true);
  });

  it('removeFavorite() resolves false on error instead of throwing', () => {
    let ok: boolean | undefined;
    service.removeFavorite(25).subscribe((r) => (ok = r));

    const req = httpMock.expectOne(`${API_BASE}/favorites/25`);
    expect(req.request.method).toBe('DELETE');
    req.flush('error', { status: 500, statusText: 'Server Error' });

    expect(ok).toBe(false);
  });
});
