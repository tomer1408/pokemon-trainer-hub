import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PokemonService, PokemonDetail } from '../../core/pokemon';
import { NotesService, TrainerNote } from '../../core/notes';
import { TYPE_COLORS } from '../pokemon-types';
import { PokemonDetailModal } from './pokemon-detail-modal';

describe('PokemonDetailModal', () => {
  let getById: ReturnType<typeof vi.fn>;
  let getNotes: ReturnType<typeof vi.fn>;
  let addNote: ReturnType<typeof vi.fn>;
  let deleteNote: ReturnType<typeof vi.fn>;

  function detail(overrides: Partial<PokemonDetail> = {}): PokemonDetail {
    return {
      id: 25,
      name: 'pikachu',
      baseExperience: 112,
      types: ['electric'],
      spriteUrl: 's',
      stats: [{ name: 'hp', value: 35 }],
      abilities: [],
      cry: 'cry.mp3',
      height: 4,
      weight: 60,
      flavorText: null,
      weaknesses: [],
      resistances: [],
      topMoves: [],
      ...overrides,
    };
  }

  function setup(inputs: { pokemonId?: number; detail?: PokemonDetail | null; notes?: TrainerNote[] } = {}) {
    getById = vi.fn(() => of(inputs.detail === undefined ? detail() : inputs.detail));
    getNotes = vi.fn(() => of(inputs.notes ?? []));
    addNote = vi.fn((_id: number, text: string) => of({ id: 99, pokemonId: inputs.pokemonId ?? 25, text, createdAt: '2026-01-01T00:00:00.000Z' }));
    deleteNote = vi.fn(() => of(true));

    TestBed.configureTestingModule({
      providers: [
        { provide: PokemonService, useValue: { getById } },
        { provide: NotesService, useValue: { getNotes, addNote, deleteNote } },
      ],
    });

    const fixture = TestBed.createComponent(PokemonDetailModal);
    fixture.componentRef.setInput('pokemonId', inputs.pokemonId ?? 25);
    fixture.detectChanges(); // triggers ngOnChanges
    return fixture;
  }

  it('loads the pokemon and its notes on init', () => {
    const fixture = setup({ notes: [{ id: 1, pokemonId: 25, text: 'Fast!', createdAt: 't' }] });
    const inst = fixture.componentInstance as any;

    expect(getById).toHaveBeenCalledWith(25);
    expect(getNotes).toHaveBeenCalledWith(25);
    expect(inst.pokemon()).toEqual(detail());
    expect(inst.isLoading()).toBe(false);
    expect(inst.notes().length).toBe(1);
  });

  it('resets to the overview tab and clears state when pokemonId changes', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.setTab('moves');
    inst.toggleAbility(0);

    fixture.componentRef.setInput('pokemonId', 6);
    fixture.detectChanges();

    expect(inst.tab()).toBe('overview');
    expect(inst.isAbilityExpanded(0)).toBe(false);
    expect(getById).toHaveBeenCalledWith(6);
  });

  it('addNote() ignores whitespace-only text', () => {
    const fixture = setup();
    (fixture.componentInstance as any).newNoteText.set('   ');
    fixture.componentInstance.addNote();
    expect(addNote).not.toHaveBeenCalled();
  });

  it('addNote() prepends the created note and clears the draft on success', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.newNoteText.set('Fast!');

    fixture.componentInstance.addNote();

    expect(addNote).toHaveBeenCalledWith(25, 'Fast!');
    expect(inst.notes()[0].text).toBe('Fast!');
    expect(inst.newNoteText()).toBe('');
    expect(inst.addingNote()).toBe(false);
  });

  it('addNote() does not touch the notes list or clear the draft when the server returns null', () => {
    getById = vi.fn(() => of(detail()));
    getNotes = vi.fn(() => of([]));
    addNote = vi.fn(() => of(null));
    deleteNote = vi.fn(() => of(true));
    TestBed.configureTestingModule({
      providers: [
        { provide: PokemonService, useValue: { getById } },
        { provide: NotesService, useValue: { getNotes, addNote, deleteNote } },
      ],
    });
    const fixture = TestBed.createComponent(PokemonDetailModal);
    fixture.componentRef.setInput('pokemonId', 25);
    fixture.detectChanges();
    const inst = fixture.componentInstance as any;
    inst.newNoteText.set('Fast!');

    fixture.componentInstance.addNote();

    expect(inst.notes().length).toBe(0);
    expect(inst.newNoteText()).toBe('Fast!');
  });

  it('requestDeleteNote()/cancelDeleteNote() control the pending-delete id', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestDeleteNote(1);
    expect(inst.pendingDeleteNoteId()).toBe(1);
    fixture.componentInstance.cancelDeleteNote();
    expect(inst.pendingDeleteNoteId()).toBeNull();
  });

  it('confirmDeleteNote() is a no-op without a pending id', () => {
    const fixture = setup();
    fixture.componentInstance.confirmDeleteNote();
    expect(deleteNote).not.toHaveBeenCalled();
  });

  it('confirmDeleteNote() removes the note from the list on success', () => {
    const fixture = setup({ notes: [{ id: 1, pokemonId: 25, text: 'Fast!', createdAt: 't' }] });
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestDeleteNote(1);

    fixture.componentInstance.confirmDeleteNote();

    expect(deleteNote).toHaveBeenCalledWith(1);
    expect(inst.notes().length).toBe(0);
    expect(inst.pendingDeleteNoteId()).toBeNull();
  });

  it('confirmDeleteNote() keeps the note when the server delete fails', () => {
    deleteNote = vi.fn(() => of(false));
    TestBed.configureTestingModule({
      providers: [
        { provide: PokemonService, useValue: { getById: () => of(detail()) } },
        { provide: NotesService, useValue: { getNotes: () => of([{ id: 1, pokemonId: 25, text: 'Fast!', createdAt: 't' }]), addNote, deleteNote } },
      ],
    });
    const fixture = TestBed.createComponent(PokemonDetailModal);
    fixture.componentRef.setInput('pokemonId', 25);
    fixture.detectChanges();
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.requestDeleteNote(1);
    fixture.componentInstance.confirmDeleteNote();

    expect(inst.notes().length).toBe(1);
  });

  it('requestRemoveFromTeam()/cancelRemoveFromTeam() control the confirm dialog', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.requestRemoveFromTeam();
    expect(inst.showRemoveConfirm()).toBe(true);
    fixture.componentInstance.cancelRemoveFromTeam();
    expect(inst.showRemoveConfirm()).toBe(false);
  });

  it('confirmRemoveFromTeam() closes the dialog and emits removeFromTeam', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    let emitted = false;
    fixture.componentInstance.removeFromTeam.subscribe(() => (emitted = true));
    fixture.componentInstance.requestRemoveFromTeam();

    fixture.componentInstance.confirmRemoveFromTeam();

    expect(inst.showRemoveConfirm()).toBe(false);
    expect(emitted).toBe(true);
  });

  it('setTab()/isAbilityExpanded()/toggleAbility() track UI state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance;
    inst.setTab('abilities');
    expect((inst as any).tab()).toBe('abilities');

    expect(inst.isAbilityExpanded(0)).toBe(false);
    inst.toggleAbility(0);
    expect(inst.isAbilityExpanded(0)).toBe(true);
    inst.toggleAbility(0);
    expect(inst.isAbilityExpanded(0)).toBe(false);
  });

  it('typeColor() falls back to normal for an unrecognized type', () => {
    const fixture = setup();
    expect(fixture.componentInstance.typeColor('electric')).toBe(TYPE_COLORS['electric']);
    expect(fixture.componentInstance.typeColor('made-up')).toBe(TYPE_COLORS['normal']);
  });

  it('statFillPct() caps at 100', () => {
    const fixture = setup();
    expect(fixture.componentInstance.statFillPct(999)).toBe(100);
  });

  it('statDisplayName() strips the "special-" prefix and replaces the dash', () => {
    const fixture = setup();
    expect(fixture.componentInstance.statDisplayName('special-attack')).toBe('attack');
    expect(fixture.componentInstance.statDisplayName('hp')).toBe('hp');
  });

  it('formatNoteDate() formats an ISO date into a readable string', () => {
    const fixture = setup();
    const formatted = fixture.componentInstance.formatNoteDate('2026-01-15T10:00:00.000Z');
    expect(formatted).toContain('2026');
  });

  it('playCry() does not throw when there is no cry available', () => {
    const fixture = setup({ detail: detail({ cry: null }) });
    expect(() => fixture.componentInstance.playCry()).not.toThrow();
  });

  it('onClose() emits closed', () => {
    const fixture = setup();
    let emitted = false;
    fixture.componentInstance.closed.subscribe(() => (emitted = true));
    fixture.componentInstance.onClose();
    expect(emitted).toBe(true);
  });
});
