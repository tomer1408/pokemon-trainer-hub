import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { HealthCheckResult, HealthService } from './health';

describe('HealthService', () => {
  let service: HealthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(HealthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('checkApi() reports up:true with a real measured latency on success', () => {
    let result: HealthCheckResult | undefined;
    service.checkApi().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/health`).flush({ status: 'ok', message: 'Pokemon Trainer Hub API is running!' });

    expect(result?.up).toBe(true);
    expect(typeof result?.latencyMs).toBe('number');
    expect(result!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('checkApi() reports up:false with the real HTTP status on failure', () => {
    let result: HealthCheckResult | undefined;
    service.checkApi().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/health`).flush('error', { status: 503, statusText: 'Service Unavailable' });

    expect(result?.up).toBe(false);
    expect(result?.detail).toContain('503');
  });

  it('checkDb() reports up:true on success', () => {
    let result: HealthCheckResult | undefined;
    service.checkDb().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/health/db`).flush({ status: 'ok', db: 'ok' });

    expect(result?.up).toBe(true);
  });

  it('checkDb() reports up:false on failure', () => {
    let result: HealthCheckResult | undefined;
    service.checkDb().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/health/db`).flush({ status: 'error', db: 'error' }, { status: 503, statusText: 'Service Unavailable' });

    expect(result?.up).toBe(false);
  });
});
