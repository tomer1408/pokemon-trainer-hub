import { clearStarterQuizSkip, hasSkippedStarterQuizThisSession, markStarterQuizSkipped } from './quiz-completion';

describe('quiz-completion', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('reports not skipped by default', () => {
    expect(hasSkippedStarterQuizThisSession()).toBe(false);
  });

  it('markStarterQuizSkipped() makes hasSkippedStarterQuizThisSession() true', () => {
    markStarterQuizSkipped();
    expect(hasSkippedStarterQuizThisSession()).toBe(true);
  });

  it('clearStarterQuizSkip() resets the flag (e.g. on logout, so it never carries over to the next account)', () => {
    markStarterQuizSkipped();
    clearStarterQuizSkip();
    expect(hasSkippedStarterQuizThisSession()).toBe(false);
  });

  it('fails safe (reports not skipped) if sessionStorage access throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('sessionStorage disabled');
    });

    expect(hasSkippedStarterQuizThisSession()).toBe(false);

    spy.mockRestore();
  });

  it('markStarterQuizSkipped() does not throw even if sessionStorage access fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sessionStorage disabled');
    });

    expect(() => markStarterQuizSkipped()).not.toThrow();

    spy.mockRestore();
  });
});
