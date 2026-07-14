import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PokemonService, PokemonDetail } from '../../core/pokemon';
import { NotesService, TrainerNote } from '../../core/notes';
import { TYPE_COLORS, PokemonTypeName } from '../pokemon-types';
import { LoadingScreen } from '../loading-screen/loading-screen';

type Tab = 'overview' | 'abilities' | 'moves' | 'notes';

// Shared, presentational: the host page owns favorite/team state and mutations
// (it already has that data reactively) — this component only displays a
// Pokémon's detail and emits the user's intent (toggleFavorite/addToTeam).
@Component({
  selector: 'app-pokemon-detail-modal',
  imports: [FormsModule, LoadingScreen],
  templateUrl: './pokemon-detail-modal.html',
  styleUrl: './pokemon-detail-modal.css',
})
export class PokemonDetailModal implements OnChanges {
  @Input({ required: true }) pokemonId!: number;
  @Input() isFavorite = false;
  @Input() isOnTeam = false;
  @Input() teamFull = false;
  // Whether the trainer has at least 1 Pokémon on their Dream Team — used
  // only to decide whether "Compare with My Team" makes sense; there's
  // nothing to compare against on a 0-member team.
  @Input() hasTeam = false;
  @Input() isLight = false;
  // Used for historical/read-only contexts (e.g. Battle History's match
  // detail) where the Pokémon shown may not even be on the trainer's team
  // anymore — hides the favorite/team-membership actions entirely rather
  // than showing controls that don't apply to a point-in-time snapshot.
  @Input() readOnly = false;

  @Output() closed = new EventEmitter<void>();
  @Output() toggleFavorite = new EventEmitter<void>();
  @Output() addToTeam = new EventEmitter<void>();
  // Opens a non-destructive head-to-head comparison against the real team —
  // only relevant while the team has room (once full, the existing
  // addToTeam output's "Compare" label already routes into the forced
  // swap flow instead).
  @Output() compare = new EventEmitter<void>();
  // Only emitted after the user confirms via this modal's own confirm
  // dialog (reusing the same one already used for deleting a note) — the
  // host page owns the actual teamService.removeFromTeam() call and team
  // state refresh, same as every other mutation this component emits.
  @Output() removeFromTeam = new EventEmitter<void>();

  private readonly pokemonService = inject(PokemonService);
  private readonly notesService = inject(NotesService);

  protected readonly pokemon = signal<PokemonDetail | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly tab = signal<Tab>('overview');
  protected readonly expandedAbilities = signal<Set<number>>(new Set());

  protected readonly notes = signal<TrainerNote[]>([]);
  protected readonly newNoteText = signal('');
  protected readonly addingNote = signal(false);
  protected readonly pendingDeleteNoteId = signal<number | null>(null);
  protected readonly showRemoveConfirm = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pokemonId']) {
      this.tab.set('overview');
      this.expandedAbilities.set(new Set());
      this.isLoading.set(true);
      this.pokemon.set(null);
      this.notes.set([]);
      this.newNoteText.set('');
      this.pendingDeleteNoteId.set(null);
      this.showRemoveConfirm.set(false);
      this.pokemonService.getById(this.pokemonId).subscribe((p) => {
        this.pokemon.set(p);
        this.isLoading.set(false);
      });
      this.notesService.getNotes(this.pokemonId).subscribe((notes) => this.notes.set(notes));
    }
  }

  addNote(): void {
    const text = this.newNoteText().trim();
    if (!text) return;

    this.addingNote.set(true);
    this.notesService.addNote(this.pokemonId, text).subscribe((note) => {
      this.addingNote.set(false);
      if (note) {
        this.notes.update((list) => [note, ...list]);
        this.newNoteText.set('');
      }
    });
  }

  requestDeleteNote(noteId: number): void {
    this.pendingDeleteNoteId.set(noteId);
  }

  cancelDeleteNote(): void {
    this.pendingDeleteNoteId.set(null);
  }

  confirmDeleteNote(): void {
    const noteId = this.pendingDeleteNoteId();
    if (noteId == null) return;

    this.notesService.deleteNote(noteId).subscribe((ok) => {
      if (ok) this.notes.update((list) => list.filter((n) => n.id !== noteId));
      this.pendingDeleteNoteId.set(null);
    });
  }

  requestRemoveFromTeam(): void {
    this.showRemoveConfirm.set(true);
  }

  cancelRemoveFromTeam(): void {
    this.showRemoveConfirm.set(false);
  }

  confirmRemoveFromTeam(): void {
    this.showRemoveConfirm.set(false);
    this.removeFromTeam.emit();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  toggleAbility(index: number): void {
    const next = new Set(this.expandedAbilities());
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.expandedAbilities.set(next);
  }

  isAbilityExpanded(index: number): boolean {
    return this.expandedAbilities().has(index);
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  statFillPct(value: number): number {
    return Math.min(100, (value / 150) * 100);
  }

  // Displayed without the "special" prefix (e.g. "special-attack" → "attack")
  // per request — the raw PokeAPI stat name is kept as-is everywhere else.
  statDisplayName(name: string): string {
    return name.replace('special-', '').replace('-', ' ');
  }

  formatNoteDate(createdAt: string): string {
    return new Date(createdAt).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  playCry(): void {
    const cry = this.pokemon()?.cry;
    if (cry) new Audio(cry).play();
  }

  onClose(): void {
    this.closed.emit();
  }
}
