import { environment } from '../../environments/environment';

// Single source of truth for the Express API's base URL, so every service
// hits the same host instead of each one hardcoding it separately. Comes
// from environment.ts (local) / environment.production.ts (deployed) via
// angular.json's fileReplacements — never hardcoded here.
export const API_BASE = environment.apiBase;
