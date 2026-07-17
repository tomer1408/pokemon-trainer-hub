import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { HealthCheckResult, HealthService } from '../../core/health';
import { Status } from './status';

describe('Status', () => {
  let checkApi: ReturnType<typeof vi.fn>;
  let checkDb: ReturnType<typeof vi.fn>;

  function up(detail = 'Up', latencyMs = 42): HealthCheckResult {
    return { up: true, latencyMs, detail };
  }

  function down(detail = 'Unreachable (HTTP 503)', latencyMs = 10): HealthCheckResult {
    return { up: false, latencyMs, detail };
  }

  function setup(apiResult: HealthCheckResult = up(), dbResult: HealthCheckResult = up()) {
    checkApi = vi.fn(() => of(apiResult));
    checkDb = vi.fn(() => of(dbResult));

    TestBed.configureTestingModule({
      providers: [{ provide: HealthService, useValue: { checkApi, checkDb } }],
    });
    const fixture = TestBed.createComponent(Status);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => vi.useRealTimers());

  it('checks both endpoints immediately on load', () => {
    setup();
    expect(checkApi).toHaveBeenCalledTimes(1);
    expect(checkDb).toHaveBeenCalledTimes(1);
  });

  it('reflects real up results from both checks and derives allUp() as true', () => {
    const fixture = setup(up('API is up', 12), up('DB is up', 34));
    const inst = fixture.componentInstance as any;

    expect(inst.apiStatus()).toEqual({ up: true, latencyMs: 12, detail: 'API is up' });
    expect(inst.dbStatus()).toEqual({ up: true, latencyMs: 34, detail: 'DB is up' });
    expect(inst.allUp()).toBe(true);
    expect(inst.lastChecked()).toBeInstanceOf(Date);
  });

  it('derives allUp() as false when either check is down', () => {
    const fixture = setup(down(), up());
    expect((fixture.componentInstance as any).allUp()).toBe(false);
  });

  it('checkNow() re-triggers both real checks', () => {
    const fixture = setup();
    checkApi.mockClear();
    checkDb.mockClear();

    fixture.componentInstance.checkNow();

    expect(checkApi).toHaveBeenCalledTimes(1);
    expect(checkDb).toHaveBeenCalledTimes(1);
  });

  it('auto-polls both checks again after 30 seconds', () => {
    vi.useFakeTimers();
    setup();
    checkApi.mockClear();
    checkDb.mockClear();

    vi.advanceTimersByTime(30_000);

    expect(checkApi).toHaveBeenCalledTimes(1);
    expect(checkDb).toHaveBeenCalledTimes(1);
  });

  it('clears the poll interval on destroy (no further checks fire)', () => {
    vi.useFakeTimers();
    const fixture = setup();
    fixture.destroy();
    checkApi.mockClear();
    checkDb.mockClear();

    vi.advanceTimersByTime(60_000);

    expect(checkApi).not.toHaveBeenCalled();
    expect(checkDb).not.toHaveBeenCalled();
  });
});
