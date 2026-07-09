import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of, switchMap, timer } from 'rxjs';
import { PokemonService, PokemonSummary } from '../../core/pokemon';
import { DreamTeamMember, TeamService } from '../../core/team';
import { getStrongestMember, getTeamPower } from '../../shared/team-power';
import {
  POKEMON_TYPES,
  PokemonTypeName,
  TYPE_COLORS,
  TYPE_RECOMMENDATION_REASON,
  matchTypeFromDescription,
} from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';

type Tab = 'analyze' | 'find';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  recType?: PokemonTypeName;
  recPokemon?: PokemonSummary | null;
}

@Component({
  selector: 'app-ai-trainer-assistant',
  imports: [RouterLink],
  templateUrl: './ai-trainer-assistant.html',
  styleUrl: './ai-trainer-assistant.css',
})
export class AiTrainerAssistant {
  private readonly teamService = inject(TeamService);
  private readonly pokemonService = inject(PokemonService);
  protected readonly theme = inject(ThemeService);

  protected readonly tab = signal<Tab>('analyze');
  protected readonly suggestionSeed = signal(0);

  protected readonly team = toSignal(this.teamService.getTeam(), {
    initialValue: [] as DreamTeamMember[],
  });

  protected readonly isAnalyzeTab = computed(() => this.tab() === 'analyze');
  protected readonly isFindTab = computed(() => this.tab() === 'find');

  protected readonly totalPower = computed(() => getTeamPower(this.team()));
  protected readonly strongest = computed(() => getStrongestMember(this.team()));

  protected readonly presentTypes = computed(
    () => Array.from(new Set(this.team().flatMap((m) => m.types))) as PokemonTypeName[],
  );
  protected readonly missingTypes = computed(() =>
    POKEMON_TYPES.filter((t) => !this.presentTypes().includes(t)),
  );

  // Cycles through gap types (or, once the team is fully covered, present
  // types) each time "Refresh Analysis" is clicked.
  protected readonly suggestionType = computed<PokemonTypeName | null>(() => {
    if (this.team().length === 0) return null;
    const pool = this.missingTypes().length > 0 ? this.missingTypes() : this.presentTypes();
    return pool.length > 0 ? pool[this.suggestionSeed() % pool.length] : null;
  });

  protected readonly suggestion = toSignal(
    toObservable(this.suggestionType).pipe(
      switchMap((type) => (type ? this.pokemonService.getStrongestOfType(type) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly analysisIntro = "Looking at your squad, here's what I'm seeing.";

  protected readonly analysisStrength = computed(() => {
    const present = this.presentTypes();
    if (present.length === 0) {
      return 'Your Dream Team is empty right now — add a few Pokémon and I can break down your coverage.';
    }
    return `You've got solid coverage in ${present.join(', ')}, so most matchups in those types should go your way.`;
  });

  protected readonly analysisGap = computed(() => {
    if (this.team().length === 0) return '';
    const missing = this.missingTypes();
    return missing.length === 0
      ? "Impressively, you've got every type covered — I'd focus on raw Power from here."
      : `The one gap I'd flag: nothing on your team handles ${missing.slice(0, 2).join(' or ')} well.`;
  });

  protected readonly queryText = signal('');
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected readonly isThinking = signal(false);
  protected readonly noQuery = computed(() => !this.queryText().trim());

  protected readonly typeColors = TYPE_COLORS;
  protected readonly recommendationReasons = TYPE_RECOMMENDATION_REASON;

  setTabAnalyze(): void {
    this.tab.set('analyze');
  }

  setTabFind(): void {
    this.tab.set('find');
  }

  onRerollAnalysis(): void {
    this.suggestionSeed.update((s) => s + 1);
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

    const matchedType = matchTypeFromDescription(text);
    const recommendation$ = matchedType ? this.pokemonService.getStrongestOfType(matchedType) : of(null);

    timer(900)
      .pipe(switchMap(() => recommendation$))
      .subscribe((pokemon) => {
        this.isThinking.set(false);
        this.chatMessages.update((msgs) => [
          ...msgs,
          matchedType && pokemon
            ? {
                role: 'assistant',
                text: "Based on what you described, here's what I'd catch:",
                recType: matchedType,
                recPokemon: pokemon,
              }
            : {
                role: 'assistant',
                text: "I couldn't quite match that to a type — try mentioning a trait like fast, defensive, fiery, or aquatic and I'll find something.",
              },
        ]);
      });
  }
}
