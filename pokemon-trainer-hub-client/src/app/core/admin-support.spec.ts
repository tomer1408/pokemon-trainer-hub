import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AdminSupportService, SupportRequestDetail, SupportListResult } from './admin-support';

describe('AdminSupportService', () => {
  let service: AdminSupportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminSupportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() sends only the real, non-empty filters as query params', () => {
    let result: SupportListResult | undefined;
    service.list({ status: 'open', page: 2, search: '' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne(
      (r) => r.url === `${API_BASE}/admin/support` && r.params.get('status') === 'open' && r.params.get('page') === '2',
    );
    expect(req.request.params.has('search')).toBe(false);
    req.flush({ results: [], page: 2, pageSize: 20, total: 0 });

    expect(result?.page).toBe(2);
  });

  it('list() with no filters sends no query params', () => {
    service.list().subscribe();
    const req = httpMock.expectOne(`${API_BASE}/admin/support`);
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ results: [], page: 1, pageSize: 20, total: 0 });
  });

  it('getById() fetches the real detail including history', () => {
    let result: SupportRequestDetail | undefined;
    service.getById(5).subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/admin/support/5`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 5, history: [{ id: 1, action: 'support.status_changed' }] });

    expect(result?.history.length).toBe(1);
  });

  it('update() PATCHes only the given fields', () => {
    service.update(5, { status: 'resolved' }).subscribe();

    const req = httpMock.expectOne(`${API_BASE}/admin/support/5`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'resolved' });
    req.flush({ id: 5, status: 'resolved' });
  });
});
