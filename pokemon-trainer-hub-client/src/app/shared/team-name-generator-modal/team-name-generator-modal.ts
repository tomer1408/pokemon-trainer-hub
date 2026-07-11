import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { AssistantService, TEAM_NAME_STYLES, TeamNameStyle } from '../../core/assistant';

// Shared by My Team (saves immediately via ProfileService.updateTeamName),
// Onboarding, and the Profile edit modal (both of which just fill their own
// form field — the real save happens later via their existing Save action).
// This component never decides how a chosen name gets persisted; it only
// ever emits the string the trainer picked via (nameSelected).
@Component({
  selector: 'app-team-name-generator-modal',
  templateUrl: './team-name-generator-modal.html',
  styleUrl: './team-name-generator-modal.css',
})
export class TeamNameGeneratorModal {
  @Input() isLight = false;
  // True when the trainer's Dream Team has no members yet — generation is
  // disabled and the modal explains why instead of calling the server.
  @Input() teamEmpty = false;
  // Set by the host while it's persisting a chosen name (My Team only) —
  // disables the suggestion buttons and shows a saving state.
  @Input() saving = false;
  // Set by the host if persisting the chosen name failed, so the trainer
  // can pick again or retry without losing the current suggestions.
  @Input() saveError: string | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() nameSelected = new EventEmitter<string>();

  private readonly assistantService = inject(AssistantService);

  protected readonly styles = TEAM_NAME_STYLES;
  protected readonly selectedStyle = signal<TeamNameStyle>('Epic');
  protected readonly loading = signal(false);
  protected readonly suggestions = signal<string[]>([]);
  protected readonly source = signal<'ai' | 'fallback' | null>(null);
  protected readonly generationError = signal<string | null>(null);

  selectStyle(style: TeamNameStyle): void {
    this.selectedStyle.set(style);
  }

  generate(): void {
    if (this.loading() || this.teamEmpty) return;

    this.loading.set(true);
    this.generationError.set(null);
    this.suggestions.set([]);

    this.assistantService.generateTeamNames(this.selectedStyle()).subscribe((result) => {
      this.loading.set(false);
      if (result.ok) {
        this.suggestions.set(result.value.names);
        this.source.set(result.value.source ?? 'ai');
      } else {
        this.generationError.set(result.message);
      }
    });
  }

  useThisName(name: string): void {
    if (this.saving) return;
    this.nameSelected.emit(name);
  }

  close(): void {
    if (this.saving) return;
    this.closed.emit();
  }
}
