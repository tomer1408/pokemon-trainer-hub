import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProfileService } from '../../core/profile';
import { QuizService, QuizRound } from '../../core/quiz';
import { AnalyticsService } from '../../core/analytics';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';

const ROUND_SECONDS = 10;
const TIMER_TICK_MS = 100;

interface OptionView {
  id: number;
  name: string;
  types: string[];
  isTarget: boolean;
  isPicked: boolean;
}

// Every round's target + 3 distractor options are fetched fresh from the
// server (GET /api/quiz/round, backed by services/pokeapi.js) — always real
// Pokémon, real names, real types, real sprites. The silhouette itself is
// just the real sprite rendered with `filter: brightness(0)` until revealed,
// not a generic per-type placeholder shape.
@Component({
  selector: 'app-whos-that-pokemon',
  imports: [RouterLink],
  templateUrl: './whos-that-pokemon.html',
  styleUrl: './whos-that-pokemon.css',
})
export class WhosThatPokemon implements OnDestroy {
  private readonly quizService = inject(QuizService);
  private readonly profileService = inject(ProfileService);
  private readonly analytics = inject(AnalyticsService);
  protected readonly theme = inject(ThemeService);

  protected readonly round = signal<QuizRound | null>(null);
  protected readonly loadingRound = signal(true);
  protected readonly roundError = signal<string | null>(null);
  protected readonly picked = signal<string | null>(null);
  protected readonly revealed = signal(false);
  protected readonly timeLeft = signal(ROUND_SECONDS);

  protected readonly score = signal(0);
  protected readonly streak = signal(0);
  protected readonly roundNumber = signal(1);
  // Seeded from the trainer's real, server-stored best (whosThatBestStreak)
  // — not browser localStorage — and only ever raised locally when a fresh
  // streak actually beats it, mirroring the server's own "keep the higher
  // value" rule in PATCH /api/profile/whos-that-streak.
  protected readonly best = signal(0);

  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly notRevealed = computed(() => !this.revealed());
  protected readonly timerPct = computed(() => Math.max(0, (this.timeLeft() / ROUND_SECONDS) * 100));

  protected readonly options = computed<OptionView[]>(() => {
    const r = this.round();
    if (!r) return [];
    const picked = this.picked();
    return r.options.map((o) => ({
      id: o.id,
      name: o.name,
      types: o.types,
      isTarget: o.name === r.target.name,
      isPicked: picked === o.name,
    }));
  });

  protected readonly wasCorrect = computed(() => {
    const r = this.round();
    return !!r && this.picked() === r.target.name;
  });

  protected readonly feedbackText = computed(() => {
    const r = this.round();
    if (!r) return '';
    if (this.picked() == null) return `Time's up! It was ${r.target.name}.`;
    return this.wasCorrect() ? 'Correct! Nice one.' : `Nope — it was ${r.target.name}.`;
  });

  constructor() {
    this.profileService.getProfile().subscribe((profile) => {
      this.best.set(profile?.whosThatBestStreak ?? 0);
    });
    this.loadRound();
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  pick(name: string): void {
    this.reveal(name);
  }

  next(): void {
    this.roundNumber.update((n) => n + 1);
    this.loadRound();
  }

  retry(): void {
    this.loadRound();
  }

  private loadRound(): void {
    this.clearTimer();
    this.loadingRound.set(true);
    this.roundError.set(null);
    this.revealed.set(false);
    this.picked.set(null);
    this.timeLeft.set(ROUND_SECONDS);

    this.quizService.getRound().subscribe((round) => {
      this.loadingRound.set(false);
      if (!round) {
        this.roundError.set("Couldn't load a new round. Please try again.");
        return;
      }
      this.round.set(round);
      this.startTimer();
    });
  }

  private startTimer(): void {
    this.clearTimer();
    this.timer = setInterval(() => {
      const next = this.timeLeft() - TIMER_TICK_MS / 1000;
      if (next <= 0) {
        this.timeLeft.set(0);
        this.reveal(null);
      } else {
        this.timeLeft.set(next);
      }
    }, TIMER_TICK_MS);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private reveal(name: string | null): void {
    if (this.revealed()) return;
    this.clearTimer();

    const r = this.round();
    if (!r) return;

    const correct = name === r.target.name;
    this.picked.set(name);
    this.revealed.set(true);

    if (correct) {
      const timeBonus = Math.round(this.timeLeft() * 10);
      this.score.update((s) => s + 100 + timeBonus);
      this.streak.update((s) => s + 1);
    } else {
      this.streak.set(0);
    }

    // The only real server-side signal of "a round happened" — the server
    // never otherwise learns whether a guess was right, since the whole
    // round is evaluated here, client-side.
    this.analytics.logEvent('whos_that_round_completed', undefined, { correct, streak: this.streak() });

    if (this.streak() > this.best()) {
      this.best.set(this.streak());
      this.profileService.updateWhosThatBestStreak(this.streak()).subscribe();
    }
  }
}
