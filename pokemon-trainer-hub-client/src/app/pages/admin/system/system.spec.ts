import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminSystemService, SystemHealth } from '../../../core/admin-system';
import { AdminSystem } from './system';

describe('AdminSystem', () => {
  function health(overrides: Partial<SystemHealth> = {}): SystemHealth {
    return {
      runtime: { nodeVersion: 'v20.0.0', nodeEnv: 'production', uptimeSeconds: 3725 },
      dependencies: [
        { name: 'Database', status: 'operational', latencyMs: 4 },
        { name: 'PokeAPI', status: 'operational', latencyMs: 120 },
        { name: 'Gemini (AI Assistant)', status: 'configured' },
      ],
      errors: { sentryStatus: 'configured' },
      build: { appVersion: '1.0.0', latestMigration: '20260101000000_init', gitCommit: 'abc1234' },
      ...overrides,
    };
  }

  function setup(getSystemHealth: () => ReturnType<AdminSystemService['getSystemHealth']>) {
    TestBed.configureTestingModule({
      providers: [{ provide: AdminSystemService, useValue: { getSystemHealth } }],
    });
    const fixture = TestBed.createComponent(AdminSystem);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the real system health on init', () => {
    const fixture = setup(() => of(health()));
    const inst = fixture.componentInstance as any;

    expect(inst.isLoading()).toBe(false);
    expect(inst.loadError()).toBe(false);
    expect(inst.health()?.dependencies.length).toBe(3);
  });

  it('shows a real error state when the request fails', () => {
    const fixture = setup(() => throwError(() => new Error('down')));
    const inst = fixture.componentInstance as any;

    expect(inst.isLoading()).toBe(false);
    expect(inst.loadError()).toBe(true);
    expect(inst.health()).toBeNull();
  });

  it('load() re-runs the real health check (used by the Re-run checks button)', () => {
    const getSystemHealth = vi.fn(() => of(health()));
    const fixture = setup(getSystemHealth);
    getSystemHealth.mockClear();

    fixture.componentInstance.load();

    expect(getSystemHealth).toHaveBeenCalledTimes(1);
  });

  it('formatUptime() converts real seconds into h/m/s', () => {
    const fixture = setup(() => of(health()));

    expect(fixture.componentInstance.formatUptime(3725)).toBe('1h 2m 5s');
  });
});
