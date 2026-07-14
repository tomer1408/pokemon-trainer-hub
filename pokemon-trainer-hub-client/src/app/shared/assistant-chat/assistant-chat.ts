import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { AssistantService } from '../../core/assistant';
import { PokemonService, PokemonSummary } from '../../core/pokemon';
import { TeamService } from '../../core/team';
import { FavoritesService } from '../../core/favorites';
import { PokemonDetailModal } from '../pokemon-detail-modal/pokemon-detail-modal';
import { TeamSwapModal } from '../team-swap-modal/team-swap-modal';
import { ThemeService } from '../theme';
import { AI_THINKING_MESSAGES } from '../ai-thinking-messages';

const MAX_TEAM_SIZE = 5;

const WELCOME_TEXT =
  "Hey trainer! I'm your Trainer Assistant. Ask me anything about building teams, battles, " +
  'the Starter Quiz, or getting around the Hub.';

const SUGGESTIONS = [
  'How do I build a team?',
  'How do battles work?',
  'What is the Starter Quiz?',
  'Recommend me a Pokémon',
];

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  // Only set on an assistant message that centered on one real Pokémon —
  // clicking it opens the exact same PokemonDetailModal used everywhere
  // else in the app.
  pokemon?: PokemonSummary | null;
}

// Global floating chat widget (mounted once in app.html, alongside the
// Navbar) — real, open-ended Q&A backed by services/assistantService.js's
// chatWithAssistant(), not the structured type-recommendation logic the
// AI Trainer Assistant page uses. The FAB/header icon is Pikachu's real
// sprite (fetched from our own API, same as everywhere else) rather than an
// invented chat-bubble glyph. When a reply centers on a real Pokémon, its
// icon appears inline and opens the same detail modal (with real Add to
// Team/Favorite/Remove actions) used on every other page.
@Component({
  selector: 'app-assistant-chat',
  imports: [FormsModule, PokemonDetailModal, TeamSwapModal],
  templateUrl: './assistant-chat.html',
  styleUrl: './assistant-chat.css',
})
export class AssistantChat {
  private readonly assistantService = inject(AssistantService);
  private readonly pokemonService = inject(PokemonService);
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  protected readonly theme = inject(ThemeService);

  @ViewChild('scrollEl') private scrollEl?: ElementRef<HTMLDivElement>;

  // Pikachu (Pokédex #25) — same real-sprite convention used by the profile
  // icon picker, not a made-up icon.
  protected readonly avatarSprite = toSignal(this.pokemonService.getById(25), { initialValue: null });

  protected readonly open = signal(false);
  protected readonly draft = signal('');
  protected readonly thinking = signal(false);
  protected readonly messages = signal<ChatMessage[]>([{ role: 'assistant', text: WELCOME_TEXT }]);

  protected readonly showSuggestions = computed(() => this.messages().length <= 1 && !this.thinking());
  protected readonly suggestions = SUGGESTIONS;
  protected readonly sendDisabled = computed(() => this.thinking() || !this.draft().trim());

  // ---- Real team/favorites state, same pattern as every other page ----
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
  protected readonly compareCandidateId = signal<number | null>(null);

  // A real Gemini reply can take anywhere from ~2 to ~15 seconds — this
  // cycles a status message under the typing dots so a slow reply reads as
  // "still working" instead of a bubble frozen on dots.
  private readonly thinkingMessageIndex = signal(0);
  protected readonly thinkingMessage = computed(() => AI_THINKING_MESSAGES[this.thinkingMessageIndex()]);

  constructor() {
    effect(() => {
      this.messages();
      this.thinking();
      queueMicrotask(() => this.scrollToBottom());
    });

    effect((onCleanup) => {
      if (!this.thinking()) {
        this.thinkingMessageIndex.set(0);
        return;
      }
      const timer = setInterval(() => {
        this.thinkingMessageIndex.update((i) => (i + 1) % AI_THINKING_MESSAGES.length);
      }, 1800);
      onCleanup(() => clearInterval(timer));
    });
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  // Clears the conversation back to the welcome message — does not touch
  // team/favorites state, only the chat thread itself.
  resetChat(): void {
    this.messages.set([{ role: 'assistant', text: WELCOME_TEXT }]);
    this.draft.set('');
    this.thinking.set(false);
  }

  onDraftChange(value: string): void {
    this.draft.set(value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.send();
    }
  }

  pickSuggestion(text: string): void {
    this.send(text);
  }

  send(text?: string): void {
    const q = (text ?? this.draft()).trim();
    if (!q || this.thinking()) return;

    const history: ChatMessage[] = [...this.messages(), { role: 'user', text: q }];
    this.messages.set(history);
    this.draft.set('');
    this.thinking.set(true);

    this.assistantService.chat(history.map(({ role, text }) => ({ role, text }))).subscribe((result) => {
      this.thinking.set(false);
      this.messages.update((msgs) => [
        ...msgs,
        result.ok
          ? { role: 'assistant', text: result.value.text, pokemon: result.value.pokemon }
          : { role: 'assistant', text: result.message },
      ]);
    });
  }

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
  onAction(pokemonId: number): void {
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

  private scrollToBottom(): void {
    const el = this.scrollEl?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
