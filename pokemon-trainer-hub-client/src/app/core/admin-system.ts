import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

export type DependencyStatus = 'operational' | 'down' | 'configured' | 'not_configured';

export interface SystemDependency {
  name: string;
  status: DependencyStatus;
  latencyMs?: number;
}

export interface SystemRuntime {
  nodeVersion: string;
  nodeEnv: string;
  uptimeSeconds: number;
}

export interface SystemErrors {
  sentryStatus: 'configured' | 'not_configured';
}

export interface SystemBuild {
  appVersion: string;
  latestMigration: string;
  gitCommit: string;
}

export interface SystemHealth {
  runtime: SystemRuntime;
  dependencies: SystemDependency[];
  errors: SystemErrors;
  build: SystemBuild;
}

@Injectable({ providedIn: 'root' })
export class AdminSystemService {
  private readonly http = inject(HttpClient);

  getSystemHealth(): Observable<SystemHealth> {
    return this.http.get<SystemHealth>(`${API_BASE}/admin/system`);
  }
}
