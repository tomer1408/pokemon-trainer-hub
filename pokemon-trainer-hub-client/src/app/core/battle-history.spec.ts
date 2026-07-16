import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { BattleHistoryService, BattleMatchRecord, RecordMatchPayload } from './battle-history';

describe('BattleHistoryService', () => {
  let service: BattleHistoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BattleHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getHistory() falls back to an empty array on error', () => {
    let result: BattleMatchRecord[] | undefined;
    service.getHistory().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/battle-history`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toEqual([]);
  });

  it('recordMatch() is fire-and-forget: resolves true on success, false on error, never throws', () => {
    const payload: RecordMatchPayload = {
      opponentName: 'Team Rocket',
      difficulty: 'hard',
      rounds: 5,
      roundsPlayed: 5,
      opponentType: 'fire',
      luckFactor: 'balanced',
      result: 'win',
      yourWins: 3,
      oppWins: 2,
      roundDetails: [],
      teamSnapshot: [],
    };

    let ok: boolean | undefined;
    service.recordMatch(payload).subscribe((r) => (ok = r));
    let req = httpMock.expectOne(`${API_BASE}/battle-history`);
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 1 });
    expect(ok).toBe(true);

    service.recordMatch(payload).subscribe((r) => (ok = r));
    req = httpMock.expectOne(`${API_BASE}/battle-history`);
    req.flush('error', { status: 500, statusText: 'Server Error' });
    expect(ok).toBe(false);
  });
});
