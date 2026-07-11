import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';

export interface SupportRequestPayload {
  name: string;
  email: string;
  topic: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly http = inject(HttpClient);

  // Real submission, persisted server-side (SupportRequest table) — not a
  // fake "sent" message with nothing behind it.
  submit(payload: SupportRequestPayload): Observable<boolean> {
    return this.http.post(`${API_BASE}/support`, payload).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
