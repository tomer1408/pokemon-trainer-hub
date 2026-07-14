import { Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AssistantRecommendation, AssistantService } from '../../core/assistant';
import { DreamTeamMember, TeamService } from '../../core/team';
import { FavoritePokemon, FavoritesService } from '../../core/favorites';
import { getStrongestMember, getTeamPower } from '../../shared/team-power';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';
import { TeamSwapModal } from '../../shared/team-swap-modal/team-swap-modal';
import { AI_THINKING_MESSAGES } from '../../shared/ai-thinking-messages';

const MAX_TEAM_SIZE = 5;

type Tab = 'analyze' | 'find';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  recType?: PokemonTypeName;
  recPokemon?: AssistantRecommendation['pokemon'];
  recReasoning?: string;
}

// Real AI Trainer Assistant — both tabs call the server's LLM-backed
// /api/assistant endpoints (see services/assistantService.js). The model
// only ever picks a type + writes the reasoning; the Pokémon shown is
// always real PokeAPI data the server looked up afterward, never anything
// the model invented.
@Component({
  selector: 'app-ai-trainer-assistant',
  imports: [RouterLink, PokemonDetailModal, TeamSwapModal],
  templateUrl: './ai-trainer-assistant.html',
  styleUrl: './ai-trainer-assistant.css',
})
export class AiTrainerAssistant {
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly assistantService = inject(AssistantService);
  protected readonly theme = inject(ThemeService);

  protected readonly tab = signal<Tab>('analyze');

  // Refreshable (not a one-shot toSignal) — recommending a Pokémon here can
  // end with it added to the team or favorites via the same detail/swap
  // modals every other page uses, so this page needs to reflect that too.
  private readonly teamRefresh = signal(0);
  private readonly favoritesRefresh = signal(0);
  protected readonly team = toSignal(
    toObservable(this.teamRefresh).pipe(switchMap(() => this.teamService.getTeam())),
    { initialValue: [] as DreamTeamMember[] },
  );
  protected readonly favorites = toSignal(
    toObservable(this.favoritesRefresh).pipe(switchMap(() => this.favoritesService.getFavorites())),
    { initialValue: [] as FavoritePokemon[] },
  );

  protected readonly isAnalyzeTab = computed(() => this.tab() === 'analyze');
  protected readonly isFindTab = computed(() => this.tab() === 'find');

  protected readonly totalPower = computed(() => getTeamPower(this.team()));
  protected readonly strongest = computed(() => getStrongestMember(this.team()));
  protected readonly teamFull = computed(() => this.team().length >= MAX_TEAM_SIZE);
  protected readonly hasTeam = computed(() => this.team().length > 0);

  protected readonly selectedPokemonId = signal<number | null>(null);
  protected readonly swapCandidateId = signal<number | null>(null);
  protected readonly compareCandidateId = signal<number | null>(null);

  protected readonly analysisIntro = "Looking at your squad, here's what I'm seeing.";
  protected readonly analysisResult = signal<AssistantRecommendation | null>(null);
  protected readonly analysisLoading = signal(false);
  protected readonly analysisError = signal<string | null>(null);

  protected readonly queryText = signal('');
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected readonly isThinking = signal(false);
  protected readonly noQuery = computed(() => !this.queryText().trim());

  protected readonly typeColors = TYPE_COLORS;

  // A real Gemini reply can take anywhere from ~2 to ~15 seconds — this
  // cycles a status message under the typing dots (both tabs share it) so a
  // slow reply reads as "still working" instead of a bubble frozen on dots.
  protected readonly isBusy = computed(() => this.analysisLoading() || this.isThinking());
  private readonly thinkingMessageIndex = signal(0);
  protected readonly thinkingMessage = computed(() => AI_THINKING_MESSAGES[this.thinkingMessageIndex()]);

  constructor() {
    this.runAnalysis();

    effect((onCleanup) => {
      if (!this.isBusy()) {
        this.thinkingMessageIndex.set(0);
        return;
      }
      const timer = setInterval(() => {
        this.thinkingMessageIndex.update((i) => (i + 1) % AI_THINKING_MESSAGES.length);
      }, 1800);
      onCleanup(() => clearInterval(timer));
    });
  }

  setTabAnalyze(): void {
    this.tab.set('analyze');
  }

  setTabFind(): void {
    this.tab.set('find');
  }

  onRerollAnalysis(): void {
    this.runAnalysis();
  }

  private runAnalysis(): void {
    this.analysisLoading.set(true);
    this.analysisError.set(null);
    this.assistantService.analyzeTeam().subscribe((result) => {
      this.analysisLoading.set(false);
      if (result.ok) {
        this.analysisResult.set(result.value);
      } else {
        this.analysisResult.set(null);
        this.analysisError.set(result.message);
      }
    });
  }

  onQueryChange(event: Event): void {
    this.queryText.set((event.target as HTMLInputElement).value);
  }

  send(): void {
    const text = this.queryText().trim();
    if (!text) return;

    this.chatMessages.update((msgs) => [...msgs, { role: 'user', text }]);
    this.queryText.set('');
    this.isThinking.set(true);

    this.assistantService.query(text).subscribe((result) => {
      this.isThinking.set(false);
      this.chatMessages.update((msgs) => [
        ...msgs,
        result.ok
          ? {
              role: 'assistant',
              text: "Based on what you described, here's what I'd catch:",
              recType: result.value.type,
              recPokemon: result.value.pokemon,
              recReasoning: result.value.reasoning,
            }
          : { role: 'assistant', text: result.message },
      ]);
    });
  }

  // ---- Detail modal + team/favorites actions, same pattern as every other
  // page (Home, the global assistant-chat widget) that opens a recommended
  // Pokémon's real detail modal. ----

  isOnTeam(pokemonId: number): boolean {
    return this.team().some((m) => m.pokemonId === pokemonId);
  }

  isFavorite(pokemonId: number): boolean {
    return this.favorites().some((f) => f.pokemonId === pokemonId);
  }

  openDetail(pokemonId: number): void {
    this.selectedPokemonId.set(pokemonId);
  }

  closeDetail(): void {
    this.selectedPokemonId.set(null);
  }

  toggleFavorite(pokemonId: number): void {
    const obs = this.isFavorite(pokemonId)
      ? this.favoritesService.removeFavorite(pokemonId)
      : this.favoritesService.addFavorite(pokemonId);
    obs.subscribe((ok) => {
      if (ok) this.favoritesRefresh.update((n) => n + 1);
    });
  }

  // Only ever called for the "Add to Team" state — when already on the
  // team, the modal shows "Remove from Team" instead, which emits
  // (removeFromTeam) below (after its own internal confirm), not this.
  addToTeam(pokemonId: number): void {
    if (this.isOnTeam(pokemonId)) return;

    if (this.teamFull()) {
      this.swapCandidateId.set(pokemonId);
      return;
    }

    this.teamService.addToTeam(pokemonId).subscribe((result) => {
      if (result.ok) {
        this.teamRefresh.update((n) => n + 1);
        this.closeDetail();
      } else if (result.reason === 'TEAM_FULL') {
        this.swapCandidateId.set(pokemonId);
      }
    });
  }

  // Modal already confirmed with the user before emitting this.
  removeFromTeamModal(pokemonId: number): void {
    this.teamService.removeFromTeam(pokemonId).subscribe(() => {
      this.teamRefresh.update((n) => n + 1);
      this.closeDetail();
    });
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
