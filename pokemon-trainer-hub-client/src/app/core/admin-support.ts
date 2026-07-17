import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

export type SupportStatus = 'open' | 'in_progress' | 'resolved';
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface AdminAuditEntry {
  id: number;
  adminAuth0UserId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detailsJson: string | null;
  createdAt: string;
}

export interface SupportRequestSummary {
  id: number;
  auth0UserId: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: SupportStatus;
  priority: SupportPriority;
  adminNotes: string | null;
  assignedTo: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportRequestDetail extends SupportRequestSummary {
  history: AdminAuditEntry[];
}

export interface SupportListFilters {
  page?: number;
  pageSize?: number;
  status?: SupportStatus;
  priority?: SupportPriority;
  topic?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface SupportListResult {
  results: SupportRequestSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SupportUpdatePatch {
  status?: SupportStatus;
  priority?: SupportPriority;
  adminNotes?: string;
  assignedTo?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminSupportService {
  private readonly http = inject(HttpClient);

  list(filters: SupportListFilters = {}): Observable<SupportListResult> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<SupportListResult>(`${API_BASE}/admin/support`, { params });
  }

  getById(id: number): Observable<SupportRequestDetail> {
    return this.http.get<SupportRequestDetail>(`${API_BASE}/admin/support/${id}`);
  }

  update(id: number, patch: SupportUpdatePatch): Observable<SupportRequestSummary> {
    return this.http.patch<SupportRequestSummary>(`${API_BASE}/admin/support/${id}`, patch);
  }
}
