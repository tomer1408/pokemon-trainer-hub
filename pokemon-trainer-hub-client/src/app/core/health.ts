import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';

export interface HealthCheckResult {
  up: boolean;
  // Measured client-side, round-trip — genuinely real, not simulated.
  latencyMs: number;
  detail: string;
}

// Thin wrapper around the two already-real, already-deployed health
// endpoints (server.js's GET /api/health and GET /api/health/db) — no
// server changes needed for this. Powers the /status page.
@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  checkApi(): Observable<HealthCheckResult> {
    return this.runCheck(`${API_BASE}/health`, 'The API server is up.');
  }

  checkDb(): Observable<HealthCheckResult> {
    return this.runCheck(`${API_BASE}/health/db`, 'The database connection is healthy.');
  }

  private runCheck(url: string, upDetail: string): Observable<HealthCheckResult> {
    const start = performance.now();
    return this.http.get(url).pipe(
      map(() => ({ up: true, latencyMs: Math.round(performance.now() - start), detail: upDetail })),
      catchError((err: HttpErrorResponse) =>
        of({
          up: false,
          latencyMs: Math.round(performance.now() - start),
          detail: err.status ? `Unreachable (HTTP ${err.status})` : 'Unreachable — no response.',
        }),
      ),
    );
  }
}
