import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AssistantRecommendation, AssistantService } from '../../core/assistant';
import { DreamTeamMember, TeamService } from '../../core/team';
import { getStrongestMember, getTeamPower } from '../../shared/team-power';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';

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
  imports: [RouterLink],
  templateUrl: './ai-trainer-assistant.html',
  styleUrl: './ai-trainer-assistant.css',
})
export class AiTrainerAssistant {
  private readonly teamService = inject(TeamService);
  private readonly assistantService = inject(AssistantService);
  protected readonly theme = inject(ThemeService);

  protected readonly tab = signal<Tab>('analyze');

  protected readonly team = toSignal(this.teamService.getTeam(), {
    initialValue: [] as DreamTeamMember[],
  });

  protected readonly isAnalyzeTab = computed(() => this.tab() === 'analyze');
  protected readonly isFindTab = computed(() => this.tab() === 'find');

  protected readonly totalPower = computed(() => getTeamPower(this.team()));
  protected readonly strongest = computed(() => getStrongestMember(this.team()));

  protected readonly analysisIntro = "Looking at your squad, here's what I'm seeing.";
  protected readonly analysisResult = signal<AssistantRecommendation | null>(null);
  protected readonly analysisLoading = signal(false);
  protected readonly analysisError = signal<string | null>(null);

  protected readonly queryText = signal('');
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected readonly isThinking = signal(false);
  protected readonly noQuery = computed(() => !this.queryText().trim());

  protected readonly typeColors = TYPE_COLORS;

  constructor() {
    this.runAnalysis();
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
}
