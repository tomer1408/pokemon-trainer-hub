import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AdminTrainersService, TrainerDetail, TrainerListResult } from './admin-trainers';

describe('AdminTrainersService', () => {
  let service: AdminTrainersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminTrainersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() sends only the real, non-empty filters as query params', () => {
    let result: TrainerListResult | undefined;
    service.list({ search: 'ash', page: 2 }).subscribe((r) => (result = r));

    const req = httpMock.expectOne(
      (r) => r.url === `${API_BASE}/admin/trainers` && r.params.get('search') === 'ash' && r.params.get('page') === '2',
    );
    req.flush({ results: [], page: 2, pageSize: 20, total: 0 });

    expect(result?.page).toBe(2);
  });

  it('getDetail() URL-encodes an Auth0 id containing "|"', () => {
    let result: TrainerDetail | undefined;
    service.getDetail('auth0|abc123').subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/admin/trainers/auth0%7Cabc123`);
    expect(req.request.method).toBe('GET');
    req.flush({ profile: { trainerName: 'Ash' } });

    expect(result?.profile.trainerName).toBe('Ash');
  });

  it('getAuth0Info() hits the real, encoded /auth0 read endpoint', () => {
    service.getAuth0Info('auth0|abc123').subscribe();

    const req = httpMock.expectOne(`${API_BASE}/admin/trainers/auth0%7Cabc123/auth0`);
    expect(req.request.method).toBe('GET');
    req.flush({ email: 'ash@example.com' });
  });

  it('deleteTrainer() DELETEs the real, encoded resource', () => {
    service.deleteTrainer('auth0|abc123').subscribe();

    const req = httpMock.expectOne(`${API_BASE}/admin/trainers/auth0%7Cabc123`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Deleted.' });
  });

  it('listDeleted() sends only the real, non-empty filters as query params', () => {
    let result: import('./admin-trainers').DeletedTrainerListResult | undefined;
    service.listDeleted({ search: 'ash', page: 2 }).subscribe((r) => (result = r));

    const req = httpMock.expectOne(
      (r) => r.url === `${API_BASE}/admin/trainers/deleted` && r.params.get('search') === 'ash' && r.params.get('page') === '2',
    );
    req.flush({ results: [], page: 2, pageSize: 20, total: 0 });

    expect(result?.page).toBe(2);
  });

  it('restoreTrainer() PATCHes the real, encoded restore endpoint', () => {
    service.restoreTrainer('auth0|abc123').subscribe();

    const req = httpMock.expectOne(`${API_BASE}/admin/trainers/auth0%7Cabc123/restore`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ message: 'Restored.' });
  });

  it('permanentlyDeleteTrainer() DELETEs the real, encoded /permanent endpoint', () => {
    service.permanentlyDeleteTrainer('auth0|abc123').subscribe();

    const req = httpMock.expectOne(`${API_BASE}/admin/trainers/auth0%7Cabc123/permanent`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Permanently deleted.' });
  });
});
