import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AdminAnalyticsService, Analytics } from './admin-analytics';

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminAnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAnalytics(days) sends the real days query param', () => {
    service.getAnalytics(14).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${API_BASE}/admin/analytics` && r.params.get('days') === '14');
    req.flush({} as Analytics);
  });

  it('getAnalytics() with no argument sends no days query param', () => {
    service.getAnalytics().subscribe();

    const req = httpMock.expectOne(`${API_BASE}/admin/analytics`);
    expect(req.request.params.has('days')).toBe(false);
    req.flush({} as Analytics);
  });
});
