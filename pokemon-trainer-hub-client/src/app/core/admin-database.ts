import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

export interface DatabaseTableSummary {
  key: string;
  label: string;
  description: string;
  count: number;
}

// Every row is dynamic (shape depends entirely on which table is selected)
// — the server already masks/strips sensitive fields before this ever
// reaches the client (services/adminDatabaseRegistry.js), so nothing here
// re-implements that logic, it just renders whatever safe shape comes back.
export type DatabaseRecord = Record<string, unknown>;

export interface DatabaseListFilters {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  search?: string;
}

export interface DatabaseListResult {
  results: DatabaseRecord[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class AdminDatabaseService {
  private readonly http = inject(HttpClient);

  listTables(): Observable<DatabaseTableSummary[]> {
    return this.http.get<DatabaseTableSummary[]>(`${API_BASE}/admin/database/tables`);
  }

  listRecords(table: string, filters: DatabaseListFilters = {}): Observable<DatabaseListResult> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<DatabaseListResult>(`${API_BASE}/admin/database/${encodeURIComponent(table)}`, { params });
  }

  getRecord(table: string, id: number): Observable<DatabaseRecord> {
    return this.http.get<DatabaseRecord>(`${API_BASE}/admin/database/${encodeURIComponent(table)}/${id}`);
  }
}
