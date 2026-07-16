import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { QuizRound, QuizService } from './quiz';

describe('QuizService', () => {
  let service: QuizService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(QuizService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getRound() returns the round on success', () => {
    const round: QuizRound = {
      target: { id: 25, name: 'pikachu', types: ['electric'], spriteUrl: 's', baseExperience: 112 },
      options: [{ id: 25, name: 'pikachu', types: ['electric'] }],
    };
    let result: QuizRound | null | undefined;
    service.getRound().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/quiz/round`).flush(round);

    expect(result).toEqual(round);
  });

  it('getRound() resolves null on error (e.g. a 502 from too few candidates)', () => {
    let result: QuizRound | null | undefined;
    service.getRound().subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/quiz/round`).flush('error', { status: 502, statusText: 'Bad Gateway' });

    expect(result).toBeNull();
  });
});
