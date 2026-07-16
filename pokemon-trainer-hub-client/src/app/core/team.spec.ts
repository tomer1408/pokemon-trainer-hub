import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AddToTeamResult, DreamTeamMember, TeamService } from './team';

describe('TeamService', () => {
  let service: TeamService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TeamService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getTeam() falls back to an empty array on error, unlike getTeamStrict()', () => {
    let result: DreamTeamMember[] | undefined;
    service.getTeam().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/team`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toEqual([]);
  });

  it('getTeamStrict() propagates the error instead of swallowing it', () => {
    let errored = false;
    service.getTeamStrict().subscribe({ error: () => (errored = true) });

    httpMock.expectOne(`${API_BASE}/team`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(errored).toBe(true);
  });

  it('addToTeam() maps a successful response to { ok: true }', () => {
    let result: AddToTeamResult | undefined;
    service.addToTeam(25).subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/team/25`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'joined' });

    expect(result).toEqual({ ok: true });
  });

  it('addToTeam() maps a DUPLICATE 409 to its specific reason', () => {
    let result: AddToTeamResult | undefined;
    service.addToTeam(25).subscribe((r) => (result = r));

    httpMock
      .expectOne(`${API_BASE}/team/25`)
      .flush({ reason: 'DUPLICATE', message: 'Already on your team.' }, { status: 409, statusText: 'Conflict' });

    expect(result).toEqual({ ok: false, reason: 'DUPLICATE', message: 'Already on your team.' });
  });

  it('addToTeam() maps an unrecognized error reason to OTHER', () => {
    let result: AddToTeamResult | undefined;
    service.addToTeam(25).subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/team/25`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toEqual({ ok: false, reason: 'OTHER', message: 'Something went wrong adding this Pokémon.' });
  });

  it('removeFromTeam() sends a DELETE to the right URL', () => {
    service.removeFromTeam(25).subscribe();
    const req = httpMock.expectOne(`${API_BASE}/team/25`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('reorderTeam() resolves true on success, false on error', () => {
    let ok: boolean | undefined;
    service.reorderTeam([6, 25]).subscribe((r) => (ok = r));

    const req = httpMock.expectOne(`${API_BASE}/team/reorder`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ pokemonIds: [6, 25] });
    req.flush({ message: 'saved' });

    expect(ok).toBe(true);
  });

  it('saveTeam() returns the saved team from the server on success', () => {
    const savedTeam = [{ pokemonId: 25 }] as DreamTeamMember[];
    let result: any;
    service.saveTeam([25]).subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/team`);
    expect(req.request.method).toBe('PUT');
    req.flush(savedTeam);

    expect(result).toEqual({ ok: true, team: savedTeam });
  });

  it('saveTeam() surfaces the server error message on failure', () => {
    let result: any;
    service.saveTeam([25]).subscribe((r) => (result = r));

    httpMock
      .expectOne(`${API_BASE}/team`)
      .flush({ message: 'Team is invalid.' }, { status: 400, statusText: 'Bad Request' });

    expect(result).toEqual({ ok: false, message: 'Team is invalid.' });
  });

  it('swapTeamMember() maps a DUPLICATE error to its specific reason', () => {
    let result: AddToTeamResult | undefined;
    service.swapTeamMember(25, 4).subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/team/swap`);
    expect(req.request.body).toEqual({ removePokemonId: 25, addPokemonId: 4 });
    req.flush({ reason: 'DUPLICATE', message: 'Already on your team.' }, { status: 409, statusText: 'Conflict' });

    expect(result).toEqual({ ok: false, reason: 'DUPLICATE', message: 'Already on your team.' });
  });
});
