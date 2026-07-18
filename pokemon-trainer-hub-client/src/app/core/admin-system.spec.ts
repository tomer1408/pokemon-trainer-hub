import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { AdminSystemService, SystemHealth } from './admin-system';

describe('AdminSystemService', () => {
  let service: AdminSystemService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminSystemService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getSystemHealth() fetches the real combined health response', () => {
    let result: SystemHealth | undefined;
    service.getSystemHealth().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/admin/system`);
    expect(req.request.method).toBe('GET');
    req.flush({
      runtime: { nodeVersion: 'v20.0.0', nodeEnv: 'production', uptimeSeconds: 120 },
      dependencies: [{ name: 'Database', status: 'operational', latencyMs: 4 }],
      errors: { sentryStatus: 'configured' },
      build: { appVersion: '1.0.0', latestMigration: '20260101000000_init', gitCommit: 'abc1234' },
    });

    expect(result?.runtime.nodeVersion).toBe('v20.0.0');
    expect(result?.dependencies[0].name).toBe('Database');
    expect(result?.errors.sentryStatus).toBe('configured');
    expect(result?.build.gitCommit).toBe('abc1234');
  });
});
