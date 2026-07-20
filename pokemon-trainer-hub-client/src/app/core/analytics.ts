import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, of } from 'rxjs';
import { API_BASE } from './api-base';

// Must exactly match services/analyticsEventService.js's
// CLIENT_ALLOWED_EVENT_TYPES on the server — that allowlist (not this type)
// is the real security boundary; this is just so a typo here fails at
// compile time instead of as a silent 400 in production.
export type ClientEventType = 'session_started' | 'page_viewed' | 'whos_that_round_completed';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  // Fire-and-forget by design, same contract as the server's own
  // logEventSafe: analytics must never surface an error to the trainer or
  // block whatever real action triggered it, so failures are swallowed
  // here, not left to whatever page happened to call this.
  logEvent(eventType: ClientEventType, pageName?: string, metadata?: Record<string, unknown>): void {
    this.http
      .post(`${API_BASE}/events`, { eventType, pageName, metadata })
      .pipe(catchError(() => of(null)))
      .subscribe();
  }
}
