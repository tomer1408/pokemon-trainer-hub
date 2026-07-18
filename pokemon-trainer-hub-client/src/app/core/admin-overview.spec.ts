import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AdminOverviewService, Overview } from './admin-overview';

describe('AdminOverviewService', () => {
  let service: AdminOverviewService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminOverviewService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getOverview() fetches the one combined response, not N separate calls', () => {
    let result: Overview | undefined;
    service.getOverview().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/admin/overview`);
    expect(req.request.method).toBe('GET');
    req.flush({
      kpis: { totalTrainers: 5 },
      recentSupportRequests: [{ id: 1 }],
      recentActivity: [{ type: 'trainer_joined' }],
    });

    expect(result?.kpis.totalTrainers).toBe(5);
    expect(result?.recentSupportRequests.length).toBe(1);
    expect(result?.recentActivity.length).toBe(1);
  });
});
