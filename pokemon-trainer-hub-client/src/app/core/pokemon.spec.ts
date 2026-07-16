import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { PokemonDetail, PokemonListResponse, PokemonService, PokemonSummary, TypeChart } from './pokemon';

describe('PokemonService', () => {
  let service: PokemonService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PokemonService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function summary(id: number): PokemonSummary {
    return { id, name: `mon-${id}`, baseExperience: 100, types: ['fire'], spriteUrl: 's', stats: [] };
  }

  it('getStrongestOfType() returns the first (strongest) result', () => {
    const page: PokemonListResponse = { results: [summary(6)], page: 1, pageSize: 20, total: 1 };
    let result: PokemonSummary | null | undefined;
    service.getStrongestOfType('fire').subscribe((r) => (result = r));

    const req = httpMock.expectOne(
      (r) => r.url === `${API_BASE}/pokemon` && r.params.get('type') === 'fire' && r.params.get('sort') === 'strongest',
    );
    req.flush(page);

    expect(result).toEqual(summary(6));
  });

  it('getStrongestOfType() returns null when there are no results at all', () => {
    let result: PokemonSummary | null | undefined;
    service.getStrongestOfType('fire').subscribe((r) => (result = r));

    httpMock.expectOne((r) => r.url === `${API_BASE}/pokemon`).flush({ results: [], page: 1, pageSize: 20, total: 0 });

    expect(result).toBeNull();
  });

  it('getStrongestOfType() resolves null on a request error instead of throwing', () => {
    let result: PokemonSummary | null | undefined;
    service.getStrongestOfType('fire').subscribe((r) => (result = r));

    httpMock.expectOne((r) => r.url === `${API_BASE}/pokemon`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toBeNull();
  });

  it('search() only sends params that were actually provided', () => {
    let result: PokemonListResponse | undefined;
    service.search({ search: 'pika' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === `${API_BASE}/pokemon`);
    expect(req.request.params.get('search')).toBe('pika');
    expect(req.request.params.has('type')).toBe(false);
    expect(req.request.params.has('sort')).toBe(false);
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ results: [], page: 1, pageSize: 20, total: 0 });

    expect(result).toBeTruthy();
  });

  it('search() falls back to an empty page on error', () => {
    let result: PokemonListResponse | undefined;
    service.search({}).subscribe((r) => (result = r));

    httpMock.expectOne((r) => r.url === `${API_BASE}/pokemon`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toEqual({ results: [], page: 1, pageSize: 20, total: 0 });
  });

  it('getById() resolves null on error', () => {
    let result: PokemonDetail | null | undefined;
    service.getById(25).subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/pokemon/25`).flush('error', { status: 404, statusText: 'Not Found' });

    expect(result).toBeNull();
  });

  it('getByIds() short-circuits to an empty array without any HTTP call for an empty id list', () => {
    let result: PokemonSummary[] | undefined;
    service.getByIds([]).subscribe((r) => (result = r));

    expect(result).toEqual([]);
    httpMock.expectNone(`${API_BASE}/pokemon`);
  });

  it('getByIds() joins ids into a comma-separated param and unwraps results', () => {
    let result: PokemonSummary[] | undefined;
    service.getByIds([1, 2, 3]).subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === `${API_BASE}/pokemon`);
    expect(req.request.params.get('ids')).toBe('1,2,3');
    req.flush({ results: [summary(1), summary(2), summary(3)], page: 1, pageSize: 3, total: 3 });

    expect(result).toEqual([summary(1), summary(2), summary(3)]);
  });

  it('getByIds() falls back to an empty array on error', () => {
    let result: PokemonSummary[] | undefined;
    service.getByIds([1]).subscribe((r) => (result = r));

    httpMock.expectOne((r) => r.url === `${API_BASE}/pokemon`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toEqual([]);
  });

  it('getTypeChart() falls back to an empty object on error', () => {
    let result: TypeChart | undefined;
    service.getTypeChart().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/pokemon/type-chart`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toEqual({});
  });
});
