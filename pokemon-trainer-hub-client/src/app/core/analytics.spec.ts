import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AnalyticsService } from './analytics';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('logEvent() posts the real event type, page name, and metadata', () => {
    service.logEvent('page_viewed', 'explorer');

    const req = httpMock.expectOne(`${API_BASE}/events`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ eventType: 'page_viewed', pageName: 'explorer', metadata: undefined });
    req.flush({ id: 1 });
  });

  it('logEvent() with metadata sends it through untouched', () => {
    service.logEvent('whos_that_round_completed', undefined, { correct: true, streak: 4 });

    const req = httpMock.expectOne(`${API_BASE}/events`);
    expect(req.request.body).toEqual({
      eventType: 'whos_that_round_completed',
      pageName: undefined,
      metadata: { correct: true, streak: 4 },
    });
    req.flush({ id: 1 });
  });

  it('logEvent() never throws or surfaces an error when the request fails', () => {
    expect(() => {
      service.logEvent('session_started');
      httpMock.expectOne(`${API_BASE}/events`).flush('error', { status: 500, statusText: 'Server Error' });
    }).not.toThrow();
  });
});
