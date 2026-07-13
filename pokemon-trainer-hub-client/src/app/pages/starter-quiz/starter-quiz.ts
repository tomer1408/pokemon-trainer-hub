import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { TeamService } from '../../core/team';
import { FavoritesService } from '../../core/favorites';
import { ProfileService } from '../../core/profile';
import { QUIZ_QUESTIONS, QuizAnswer } from '../../shared/quiz/quiz-questions';
import { buildPreferenceProfile } from '../../shared/quiz/quiz-preferences';
import { QuizRecommendationService, ScoredPokemon } from '../../shared/quiz/quiz-recommendation.service';
import { markStarterQuizSkipped } from '../../shared/quiz/quiz-completion';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';
import { TeamSwapModal } from '../../shared/team-swap-modal/team-swap-modal';

type Phase = 'intro' | 'quiz' | 'loading' | 'results' | 'error';

const MAX_TEAM_SIZE = 5;

// Rule-based Starter Quiz — not AI/LLM. Each answer adds fixed points to a
// preference profile (shared/quiz/quiz-questions.ts); the profile is scored
// against real Gen 1 Pokémon data at the end (quiz-recommendation.service.ts)
// to pick the top 3. See those two files for the actual logic — this
// component is just the flow/UI around them plus the existing
// Team/Favorites integration every other page already uses.
@Component({
  selector: 'app-starter-quiz',
  imports: [RouterLink, LoadingScreen, PokemonDetailModal, TeamSwapModal],
  templateUrl: './starter-quiz.html',
  styleUrl: './starter-quiz.css',
})
export class StarterQuiz {
  private readonly quizRecommendation = inject(QuizRecommendationService);
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly questions = QUIZ_QUESTIONS;
  protected readonly totalSteps = QUIZ_QUESTIONS.length;

  protected readonly phase = signal<Phase>('intro');
  protected readonly step = signal(0);
  protected readonly selectedAnswers = signal<(QuizAnswer | null)[]>(
    new Array(QUIZ_QUESTIONS.length).fill(null),
  );
  protected readonly recommendations = signal<ScoredPokemon[]>([]);

  protected readonly currentQuestion = computed(() => this.questions[Math.min(this.step(), this.questions.length - 1)]);
  protected readonly canGoBack = computed(() => this.step() > 0);
  protected readonly progressPct = computed(() => ((this.step() + 1) / this.totalSteps) * 100);

  private readonly teamRefresh = signal(0);
  private readonly favoritesRefresh = signal(0);
  protected readonly team = toSignal(
    toObservable(this.teamRefresh).pipe(switchMap(() => this.teamService.getTeam())),
    { initialValue: [] },
  );
  protected readonly favorites = toSignal(
    toObservable(this.favoritesRefresh).pipe(switchMap(() => this.favoritesService.getFavorites())),
    { initialValue: [] },
  );
  protected readonly teamFull = computed(() => this.team().length >= MAX_TEAM_SIZE);
  protected readonly hasTeam = computed(() => this.team().length > 0);

  protected readonly selectedPokemonId = signal<number | null>(null);
  protected readonly swapCandidateId = signal<number | null>(null);
  // Separate from swapCandidateId — this is the unforced "team has room"
  // compare flow (mode="compare"), never the full-team forced swap above.
  protected readonly compareCandidateId = signal<number | null>(null);
  protected readonly actionError = signal<string | null>(null);

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  startQuiz(): void {
    this.step.set(0);
    this.selectedAnswers.set(new Array(this.totalSteps).fill(null));
    this.phase.set('quiz');
  }

  // Only defers the redirect guard for this tab session — Home's own nudge
  // banner keeps showing regardless, since it checks completion, not skip.
  skipForNow(): void {
    markStarterQuizSkipped();
    this.router.navigateByUrl('/home');
  }

  selectAnswer(answer: QuizAnswer): void {
    this.selectedAnswers.update((arr) => {
      const copy = [...arr];
      copy[this.step()] = answer;
      return copy;
    });

    const next = this.step() + 1;
    if (next >= this.totalSteps) {
      this.finishQuiz();
    } else {
      this.step.set(next);
    }
  }

  goBack(): void {
    this.step.update((s) => Math.max(0, s - 1));
  }

  private finishQuiz(): void {
    this.phase.set('loading');
    const profile = buildPreferenceProfile(this.selectedAnswers());
    this.quizRecommendation.getRecommendations(profile).subscribe({
      next: (recs) => {
        this.recommendations.set(recs);
        // Real, server-side record tied to the logged-in user — waited on
        // (not fire-and-forget) before showing results, so the flag is
        // durably saved before the user can click through and log out.
        // Logout is a full-page navigation to Auth0, which aborts any
        // still-in-flight request — firing this and immediately moving on
        // let that abort the PATCH before it ever reached the database,
        // so a genuinely completed quiz could still prompt again next
        // login. markStarterQuizCompleted() already resolves (never
        // throws) even on failure, so this can't get the user stuck here.
        this.profileService.markStarterQuizCompleted().subscribe(() => {
          this.phase.set('results');
        });
      },
      error: () => this.phase.set('error'),
    });
  }

  retryScoring(): void {
    this.finishQuiz();
  }

  retakeQuiz(): void {
    this.recommendations.set([]);
    this.startQuiz();
  }

  isOnTeam(pokemonId: number): boolean {
    return this.team().some((m) => m.pokemonId === pokemonId);
  }

  isFavorite(pokemonId: number): boolean {
    return this.favorites().some((f) => f.pokemonId === pokemonId);
  }

  // Mirrors Explorer's actionLabel() so Add to Team behaves/reads identically
  // on both pages: a full (but not-yet-on-team) result opens the swap/compare
  // flow instead of silently failing, and the button says so up front.
  actionLabel(pokemonId: number): string {
    if (this.isOnTeam(pokemonId)) return 'On Team';
    if (this.teamFull()) return 'Compare';
    return 'Add to Team';
  }

  addToTeam(pokemonId: number): void {
    if (this.isOnTeam(pokemonId)) return;
    this.actionError.set(null);
    if (this.teamFull()) {
      this.swapCandidateId.set(pokemonId);
      return;
    }
    this.teamService.addToTeam(pokemonId).subscribe((result) => {
      if (result.ok) {
        this.teamRefresh.update((n) => n + 1);
        // Only close on a real success — TEAM_FULL/error below leave the
        // modal open so the user can see the message or continue into the
        // swap flow.
        this.closeDetail();
      } else if (result.reason === 'TEAM_FULL') {
        this.swapCandidateId.set(pokemonId);
      } else {
        this.actionError.set(result.message);
      }
    });
  }

  addToFavorites(pokemonId: number): void {
    if (this.isFavorite(pokemonId)) return;
    this.actionError.set(null);
    this.favoritesService.addFavorite(pokemonId).subscribe((ok) => {
      if (ok) this.favoritesRefresh.update((n) => n + 1);
      else this.actionError.set('Something went wrong adding this Pokémon to Favorites. Please try again.');
    });
  }

  openDetail(pokemonId: number): void {
    this.selectedPokemonId.set(pokemonId);
  }

  closeDetail(): void {
    this.selectedPokemonId.set(null);
  }

  // Modal already confirmed with the user before emitting this.
  removeFromTeamModal(pokemonId: number): void {
    this.teamService.removeFromTeam(pokemonId).subscribe(() => {
      this.teamRefresh.update((n) => n + 1);
      this.closeDetail();
    });
  }

  toggleFavoriteFromModal(pokemonId: number): void {
    if (this.isFavorite(pokemonId)) {
      this.favoritesService.removeFavorite(pokemonId).subscribe((ok) => {
        if (ok) this.favoritesRefresh.update((n) => n + 1);
      });
    } else {
      this.addToFavorites(pokemonId);
    }
  }

  closeSwap(): void {
    this.swapCandidateId.set(null);
  }

  onSwapped(): void {
    this.teamRefresh.update((n) => n + 1);
    this.swapCandidateId.set(null);
  }

  // 'compare' mode — team has room, so this never forces a swap; the swap
  // modal's own confirmAdd() is what actually calls teamService.addToTeam().
  onCompareWithTeam(pokemonId: number): void {
    this.compareCandidateId.set(pokemonId);
  }

  closeCompareWithTeam(): void {
    this.compareCandidateId.set(null);
  }

  onCompareAdded(): void {
    this.teamRefresh.update((n) => n + 1);
    this.compareCandidateId.set(null);
    this.closeDetail();
  }

  // 'compare' mode also allows swapping in the picked teammate (team has
  // room, so this is optional — unlike 'overflow', where it's the only way).
  onCompareSwapped(): void {
    this.teamRefresh.update((n) => n + 1);
    this.compareCandidateId.set(null);
    this.closeDetail();
  }
}
