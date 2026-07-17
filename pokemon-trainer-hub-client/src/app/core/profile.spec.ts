import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { ProfileService, TrainerProfile } from './profile';

describe('ProfileService', () => {
  let service: ProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function profile(): TrainerProfile {
    return {
      trainerName: 'Ash',
      favoriteType: 'electric',
      experienceLevel: 'Beginner',
      firstName: 'Ash',
      lastName: 'Ketchum',
      dateOfBirth: '2000-01-01',
      country: 'Japan',
      avatarPokemonId: null,
      teamName: null,
      acceptedPolicy: true,
      marketingEmailsOptIn: false,
    };
  }

  it('getProfile() resolves null on a 404 (no profile yet) instead of throwing', () => {
    let result: TrainerProfile | null | undefined;
    service.getProfile().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/profile`).flush('not found', { status: 404, statusText: 'Not Found' });

    expect(result).toBeNull();
  });

  it('getProfileStrict() propagates a 404 instead of swallowing it, unlike getProfile()', () => {
    let errored = false;
    service.getProfileStrict().subscribe({ error: () => (errored = true) });

    httpMock.expectOne(`${API_BASE}/profile`).flush('not found', { status: 404, statusText: 'Not Found' });

    expect(errored).toBe(true);
  });

  it('saveProfile() POSTs to the same upsert endpoint used by both Onboarding and Profile edits', () => {
    let result: TrainerProfile | undefined;
    service.saveProfile(profile()).subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/profile`);
    expect(req.request.method).toBe('POST');
    req.flush(profile());

    expect(result).toEqual(profile());
  });

  it('markStarterQuizCompleted() resolves true on success, false on error', () => {
    let ok: boolean | undefined;
    service.markStarterQuizCompleted().subscribe((r) => (ok = r));

    let req = httpMock.expectOne(`${API_BASE}/profile/starter-quiz`);
    expect(req.request.method).toBe('PATCH');
    req.flush(profile());
    expect(ok).toBe(true);

    service.markStarterQuizCompleted().subscribe((r) => (ok = r));
    req = httpMock.expectOne(`${API_BASE}/profile/starter-quiz`);
    req.flush('error', { status: 404, statusText: 'Not Found' });
    expect(ok).toBe(false);
  });

  it('updateTeamName() surfaces the server\'s validation message on failure', () => {
    let result: any;
    service.updateTeamName('A').subscribe((r) => (result = r));

    httpMock
      .expectOne(`${API_BASE}/profile/team-name`)
      .flush({ message: 'Team name must be 2-40 characters with no control characters.' }, { status: 400, statusText: 'Bad Request' });

    expect(result).toEqual({ ok: false, message: 'Team name must be 2-40 characters with no control characters.' });
  });

  it('updateTeamName() resolves { ok: true } on success', () => {
    let result: any;
    service.updateTeamName('Thunder Squad').subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/profile/team-name`);
    expect(req.request.body).toEqual({ name: 'Thunder Squad' });
    req.flush(profile());

    expect(result).toEqual({ ok: true });
  });

  it('updateWhosThatBestStreak() resolves true on success, false on error', () => {
    let ok: boolean | undefined;
    service.updateWhosThatBestStreak(10).subscribe((r) => (ok = r));

    const req = httpMock.expectOne(`${API_BASE}/profile/whos-that-streak`);
    expect(req.request.body).toEqual({ streak: 10 });
    req.flush(profile());

    expect(ok).toBe(true);
  });

  it('deleteAccount() DELETEs the profile resource and surfaces the server response as-is', () => {
    let result: { message: string; warning?: string } | undefined;
    service.deleteAccount().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/profile`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Your account and all your data have been deleted.', warning: 'Contact support.' });

    expect(result).toEqual({ message: 'Your account and all your data have been deleted.', warning: 'Contact support.' });
  });
});
