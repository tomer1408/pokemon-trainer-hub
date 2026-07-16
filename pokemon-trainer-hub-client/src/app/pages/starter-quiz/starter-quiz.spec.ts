import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService } from '../../core/favorites';
import { ProfileService } from '../../core/profile';
import { QuizRecommendationService } from '../../shared/quiz/quiz-recommendation.service';
import { QUIZ_QUESTIONS } from '../../shared/quiz/quiz-questions';
import { StarterQuiz } from './starter-quiz';

describe('StarterQuiz', () => {
  let getRecommendations: ReturnType<typeof vi.fn>;
  let prefetchGen1Pool: ReturnType<typeof vi.fn>;
  let getTeam: ReturnType<typeof vi.fn>;
  let addToTeam: ReturnType<typeof vi.fn>;
  let markStarterQuizCompleted: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  function member(id: number): DreamTeamMember {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', position: 0, stats: [], types: [], baseExperience: 100 };
  }

  function setup(options: { team?: DreamTeamMember[]; recsResult?: any; recsError?: boolean; addToTeamResult?: any } = {}) {
    getRecommendations = vi.fn(() =>
      options.recsError ? throwError(() => new Error('failed')) : of(options.recsResult ?? []),
    );
    prefetchGen1Pool = vi.fn();
    getTeam = vi.fn(() => of(options.team ?? []));
    addToTeam = vi.fn(() => of(options.addToTeamResult ?? { ok: true }));
    markStarterQuizCompleted = vi.fn(() => of(true));
    navigateByUrl = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: QuizRecommendationService, useValue: { getRecommendations, prefetchGen1Pool } },
        { provide: TeamService, useValue: { getTeam, addToTeam, removeFromTeam: vi.fn(() => of(undefined)) } },
        { provide: FavoritesService, useValue: { getFavorites: () => of([]), addFavorite: vi.fn(() => of(true)), removeFavorite: vi.fn(() => of(true)) } },
        { provide: ProfileService, useValue: { markStarterQuizCompleted } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    const fixture = TestBed.createComponent(StarterQuiz);
    fixture.detectChanges();
    return fixture;
  }

  it('startQuiz() resets to question 0 and starts prefetching Gen 1 data', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.step.set(3);

    fixture.componentInstance.startQuiz();

    expect(inst.phase()).toBe('quiz');
    expect(inst.step()).toBe(0);
    expect(prefetchGen1Pool).toHaveBeenCalled();
  });

  it('skipForNow() marks the skip and navigates to /home', () => {
    sessionStorage.clear();
    const fixture = setup();
    fixture.componentInstance.skipForNow();

    expect(sessionStorage.getItem('pth.starterQuizSkipped')).toBe('true');
    expect(navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('selectAnswer() records the answer and advances to the next question', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startQuiz();

    fixture.componentInstance.selectAnswer(QUIZ_QUESTIONS[0].answers[0]);

    expect(inst.step()).toBe(1);
    expect(inst.selectedAnswers()[0]).toBe(QUIZ_QUESTIONS[0].answers[0]);
  });

  it('goBack() decrements the step but never below 0', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.goBack();
    expect(inst.step()).toBe(0);

    inst.step.set(2);
    fixture.componentInstance.goBack();
    expect(inst.step()).toBe(1);
  });

  it('answering the final question scores the quiz and marks it completed before showing results', () => {
    const recs = [{ pokemonId: 25 } as any];
    const fixture = setup({ recsResult: recs });
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.startQuiz();

    QUIZ_QUESTIONS.forEach((q) => fixture.componentInstance.selectAnswer(q.answers[0]));

    expect(getRecommendations).toHaveBeenCalled();
    expect(markStarterQuizCompleted).toHaveBeenCalled();
    expect(inst.recommendations()).toEqual(recs);
    expect(inst.phase()).toBe('results');
  });

  it('sets phase to "error" when scoring fails', () => {
    const fixture = setup({ recsError: true });
    fixture.componentInstance.startQuiz();
    QUIZ_QUESTIONS.forEach((q) => fixture.componentInstance.selectAnswer(q.answers[0]));

    expect((fixture.componentInstance as any).phase()).toBe('error');
  });

  it('retryScoring() re-runs finishQuiz()', () => {
    const fixture = setup();
    fixture.componentInstance.startQuiz();
    QUIZ_QUESTIONS.forEach((q) => fixture.componentInstance.selectAnswer(q.answers[0]));

    fixture.componentInstance.retryScoring();

    expect(getRecommendations).toHaveBeenCalledTimes(2);
  });

  it('retakeQuiz() clears recommendations and restarts from question 0', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.recommendations.set([{ pokemonId: 25 } as any]);

    fixture.componentInstance.retakeQuiz();

    expect(inst.recommendations()).toEqual([]);
    expect(inst.phase()).toBe('quiz');
    expect(inst.step()).toBe(0);
  });

  it('finishQuiz() excludes the current team\'s ids from scoring', () => {
    const fixture = setup({ team: [member(1), member(2)] });
    fixture.componentInstance.startQuiz();
    QUIZ_QUESTIONS.forEach((q) => fixture.componentInstance.selectAnswer(q.answers[0]));

    expect(getRecommendations.mock.calls[0][1]).toEqual([1, 2]);
  });

  it('actionLabel() reads "On Team" for a member already on the team', () => {
    const onTeam = setup({ team: [member(25)] });
    expect(onTeam.componentInstance.actionLabel(25)).toBe('On Team');
  });

  it('actionLabel() reads "Compare" when the team is full (matching Explorer\'s logic)', () => {
    const full = setup({ team: [member(1), member(2), member(3), member(4), member(5)] });
    expect(full.componentInstance.actionLabel(99)).toBe('Compare');
  });

  it('actionLabel() reads "Add to Team" when there is room', () => {
    const empty = setup({ team: [] });
    expect(empty.componentInstance.actionLabel(99)).toBe('Add to Team');
  });

  it('addToTeam(): no-op if on team, opens swap if full, adds otherwise', () => {
    const onTeam = setup({ team: [member(25)] });
    onTeam.componentInstance.addToTeam(25);
    expect(addToTeam).not.toHaveBeenCalled();
  });

  it('addToTeam() surfaces a genuine error message (not TEAM_FULL/DUPLICATE) via actionError', () => {
    const fixture = setup({ team: [], addToTeamResult: { ok: false, reason: 'OTHER', message: 'Something broke.' } });
    fixture.componentInstance.addToTeam(99);
    expect((fixture.componentInstance as any).actionError()).toBe('Something broke.');
  });

  it('toggleFavoriteFromModal() adds when not favorited (delegates to addToFavorites)', () => {
    const addFavorite = vi.fn(() => of(true));
    TestBed.configureTestingModule({
      providers: [
        { provide: QuizRecommendationService, useValue: { getRecommendations: vi.fn(() => of([])), prefetchGen1Pool: vi.fn() } },
        { provide: TeamService, useValue: { getTeam: () => of([]), addToTeam: vi.fn(), removeFromTeam: vi.fn() } },
        { provide: FavoritesService, useValue: { getFavorites: () => of([]), addFavorite, removeFavorite: vi.fn() } },
        { provide: ProfileService, useValue: { markStarterQuizCompleted: vi.fn() } },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(StarterQuiz);
    fixture.detectChanges();

    fixture.componentInstance.toggleFavoriteFromModal(25);

    expect(addFavorite).toHaveBeenCalledWith(25);
  });
});
