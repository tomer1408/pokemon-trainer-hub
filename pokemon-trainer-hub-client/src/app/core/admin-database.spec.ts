import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AdminDatabaseService, DatabaseListResult, DatabaseTableSummary } from './admin-database';

describe('AdminDatabaseService', () => {
  let service: AdminDatabaseService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminDatabaseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listTables() fetches the real table list', () => {
    let result: DatabaseTableSummary[] | undefined;
    service.listTables().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/admin/database/tables`);
    req.flush([{ key: 'trainerProfiles', label: 'Trainer Profiles', description: '...', count: 3 }]);

    expect(result?.[0].key).toBe('trainerProfiles');
  });

  it('listRecords() sends only the real, non-empty filters as query params', () => {
    let result: DatabaseListResult | undefined;
    service.listRecords('trainerProfiles', { page: 2, search: '' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne(
      (r) => r.url === `${API_BASE}/admin/database/trainerProfiles` && r.params.get('page') === '2',
    );
    expect(req.request.params.has('search')).toBe(false);
    req.flush({ results: [], page: 2, pageSize: 20, total: 0 });

    expect(result?.page).toBe(2);
  });

  it('getRecord() fetches the real single record', () => {
    service.getRecord('trainerProfiles', 5).subscribe();

    const req = httpMock.expectOne(`${API_BASE}/admin/database/trainerProfiles/5`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 5 });
  });
});
