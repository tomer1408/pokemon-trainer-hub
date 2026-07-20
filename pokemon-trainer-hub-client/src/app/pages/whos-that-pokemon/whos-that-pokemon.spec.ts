import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProfileService } from '../../core/profile';
import { QuizService, QuizRound } from '../../core/quiz';
import { AnalyticsService } from '../../core/analytics';
import { WhosThatPokemon } from './whos-that-pokemon';

describe('WhosThatPokemon', () => {
  let getRound: ReturnType<typeof vi.fn>;
  let updateWhosThatBestStreak: ReturnType<typeof vi.fn>;
  let logEvent: ReturnType<typeof vi.fn>;

  function round(overrides: Partial<QuizRound> = {}): QuizRound {
    return {
      target: { id: 25, name: 'pikachu', types: ['electric'], spriteUrl: 's', baseExperience: 112 },
      options: [
        { id: 25, name: 'pikachu', types: ['electric'] },
        { id: 4, name: 'charmander', types: ['fire'] },
        { id: 7, name: 'squirtle', types: ['water'] },
        { id: 1, name: 'bulbasaur', types: ['grass'] },
      ],
      ...overrides,
    };
  }

  function setup(options: { round?: QuizRound | null; bestStreak?: number } = {}) {
    getRound = vi.fn(() => of(options.round === undefined ? round() : options.round));
    updateWhosThatBestStreak = vi.fn(() => of(true));
    logEvent = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: QuizService, useValue: { getRound } },
        { provide: ProfileService, useValue: { getProfile: () => of({ whosThatBestStreak: options.bestStreak ?? 0 } as any), updateWhosThatBestStreak } },
        { provide: AnalyticsService, useValue: { logEvent } },
      ],
    });

    const fixture = TestBed.createComponent(WhosThatPokemon);
    fixture.detectChanges();
    return fixture;
  }

  it('loads a round and seeds best from the real server streak', () => {
    const fixture = setup({ bestStreak: 7 });
    const inst = fixture.componentInstance as any;
    expect(getRound).toHaveBeenCalled();
    expect(inst.loadingRound()).toBe(false);
    expect(inst.round()).toEqual(round());
    expect(inst.best()).toBe(7);
  });

  it('surfaces an error when the server cannot build a round', () => {
    const fixture = setup({ round: null });
    expect((fixture.componentInstance as any).roundError()).toBe("Couldn't load a new round. Please try again.");
  });

  it('options() flags the target and the currently picked option', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.pick('charmander');

    const options = inst.options();
    expect(options.find((o: any) => o.name === 'pikachu').isTarget).toBe(true);
    expect(options.find((o: any) => o.name === 'charmander').isPicked).toBe(true);
    expect(options.find((o: any) => o.name === 'pikachu').isPicked).toBe(false);
  });

  it('pick() with the correct name awards points (base + time bonus) and increments the streak', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    inst.pick('pikachu');

    expect(inst.wasCorrect()).toBe(true);
    expect(inst.score()).toBeGreaterThanOrEqual(100);
    expect(inst.streak()).toBe(1);
    expect(inst.revealed()).toBe(true);
    expect(inst.feedbackText()).toBe('Correct! Nice one.');
    expect(logEvent).toHaveBeenCalledWith('whos_that_round_completed', undefined, { correct: true, streak: 1 });
  });

  it('pick() with a wrong name resets the streak to 0 and shows the real target name', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    inst.pick('charmander');

    expect(inst.wasCorrect()).toBe(false);
    expect(inst.streak()).toBe(0);
    expect(inst.feedbackText()).toBe('Nope — it was pikachu.');
    expect(logEvent).toHaveBeenCalledWith('whos_that_round_completed', undefined, { correct: false, streak: 0 });
  });

  it('pick() is idempotent once already revealed (a second pick is ignored)', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.pick('pikachu');
    inst.pick('charmander');

    expect(inst.picked()).toBe('pikachu');
  });

  it('persists a new best streak to the server only when the streak actually beats it', () => {
    const fixture = setup({ bestStreak: 0 });
    (fixture.componentInstance as any).pick('pikachu');

    expect(updateWhosThatBestStreak).toHaveBeenCalledWith(1);
    expect((fixture.componentInstance as any).best()).toBe(1);
  });

  it('does not touch the server when the streak does not beat the existing best', () => {
    const fixture = setup({ bestStreak: 10 });
    (fixture.componentInstance as any).pick('pikachu');

    expect(updateWhosThatBestStreak).not.toHaveBeenCalled();
    expect((fixture.componentInstance as any).best()).toBe(10);
  });

  it('the countdown auto-reveals as a miss (time\'s up feedback) once it reaches 0', () => {
    vi.useFakeTimers();
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    vi.advanceTimersByTime(10_100);

    expect(inst.revealed()).toBe(true);
    expect(inst.picked()).toBeNull();
    expect(inst.feedbackText()).toBe("Time's up! It was pikachu.");
    vi.useRealTimers();
  });

  it('next() advances the round number and loads a fresh round', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.next();

    expect(inst.roundNumber()).toBe(2);
    expect(getRound).toHaveBeenCalledTimes(2);
  });

  it('retry() reloads the round without advancing the round number', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.retry();

    expect(inst.roundNumber()).toBe(1);
    expect(getRound).toHaveBeenCalledTimes(2);
  });

  it('ngOnDestroy() clears the countdown timer (no further ticks after destroy)', () => {
    vi.useFakeTimers();
    const fixture = setup();
    fixture.destroy();

    expect(() => vi.advanceTimersByTime(10_100)).not.toThrow();
    vi.useRealTimers();
  });
});
