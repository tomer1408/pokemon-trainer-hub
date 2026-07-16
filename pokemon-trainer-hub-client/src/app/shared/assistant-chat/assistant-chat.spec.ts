import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AssistantService } from '../../core/assistant';
import { PokemonService } from '../../core/pokemon';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { NotesService } from '../../core/notes';
import { AssistantChat } from './assistant-chat';

describe('AssistantChat', () => {
  let chat: ReturnType<typeof vi.fn>;
  let getTeam: ReturnType<typeof vi.fn>;
  let addToTeam: ReturnType<typeof vi.fn>;
  let removeFromTeam: ReturnType<typeof vi.fn>;
  let getFavorites: ReturnType<typeof vi.fn>;
  let addFavorite: ReturnType<typeof vi.fn>;
  let removeFavorite: ReturnType<typeof vi.fn>;

  function member(id: number): DreamTeamMember {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', position: 0, stats: [], types: [], baseExperience: 100 };
  }

  function favorite(id: number): FavoritePokemon {
    return { pokemonId: id, pokemonName: `mon-${id}`, spriteUrl: 's', addedAt: 't', stats: [], types: [], baseExperience: 100 };
  }

  function setup(options: {
    team?: DreamTeamMember[];
    favorites?: FavoritePokemon[];
    chatResult?: any;
    addToTeamResult?: any;
  } = {}) {
    chat = vi.fn(() => of(options.chatResult ?? ({ ok: true, value: { text: 'Sure!', pokemon: null } } as any)));
    getTeam = vi.fn(() => of(options.team ?? []));
    addToTeam = vi.fn(() => of(options.addToTeamResult ?? ({ ok: true } as any)));
    removeFromTeam = vi.fn(() => of(undefined));
    getFavorites = vi.fn(() => of(options.favorites ?? []));
    addFavorite = vi.fn(() => of(true));
    removeFavorite = vi.fn(() => of(true));

    TestBed.configureTestingModule({
      providers: [
        { provide: AssistantService, useValue: { chat } },
        { provide: PokemonService, useValue: { getById: () => of(null) } },
        { provide: TeamService, useValue: { getTeam, addToTeam, removeFromTeam } },
        { provide: FavoritesService, useValue: { getFavorites, addFavorite, removeFavorite } },
        { provide: NotesService, useValue: { getNotes: () => of([]), addNote: () => of(null), deleteNote: () => of(true) } },
      ],
    });

    const fixture = TestBed.createComponent(AssistantChat);
    fixture.detectChanges();
    return fixture;
  }

  it('starts with just the welcome message and shows suggestions', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.messages().length).toBe(1);
    expect(inst.showSuggestions()).toBe(true);
  });

  it('send() is a no-op for an empty/whitespace-only draft', () => {
    const fixture = setup();
    fixture.componentInstance.send('   ');
    expect(chat).not.toHaveBeenCalled();
  });

  it('send() is a no-op while already thinking', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.thinking.set(true);
    fixture.componentInstance.send('hello');
    expect(chat).not.toHaveBeenCalled();
  });

  it('send() appends the user message immediately, then the assistant reply once it resolves', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    fixture.componentInstance.send('How do I build a team?');

    expect(inst.messages().at(-2)).toEqual({ role: 'user', text: 'How do I build a team?' });
    expect(inst.messages().at(-1)).toEqual({ role: 'assistant', text: 'Sure!', pokemon: null });
    expect(inst.thinking()).toBe(false);
    expect(inst.draft()).toBe('');
  });

  it('send() appends the server error message as the assistant reply on failure', () => {
    const fixture = setup({
      chatResult: { ok: false, message: 'The AI assistant is unavailable right now. Please try again later.' },
    });
    fixture.componentInstance.send('hi');

    const inst = fixture.componentInstance as any;
    expect(inst.messages().at(-1).text).toBe('The AI assistant is unavailable right now. Please try again later.');
  });

  it('pickSuggestion() sends the suggestion text directly', () => {
    const fixture = setup();
    fixture.componentInstance.pickSuggestion('How do battles work?');
    expect(chat.mock.calls[0][0]).toEqual([
      { role: 'assistant', text: expect.any(String) },
      { role: 'user', text: 'How do battles work?' },
    ]);
  });

  it('onKeydown() sends on Enter and prevents the default newline', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.draft.set('hello');
    const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;

    fixture.componentInstance.onKeydown(event);

    expect((event.preventDefault as any)).toHaveBeenCalled();
    expect(chat).toHaveBeenCalled();
  });

  it('resetChat() clears back to just the welcome message', () => {
    const fixture = setup();
    fixture.componentInstance.send('hello');
    fixture.componentInstance.resetChat();

    const inst = fixture.componentInstance as any;
    expect(inst.messages().length).toBe(1);
    expect(inst.draft()).toBe('');
    expect(inst.thinking()).toBe(false);
  });

  it('toggle()/close() control the open state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.open()).toBe(false);
    fixture.componentInstance.toggle();
    expect(inst.open()).toBe(true);
    fixture.componentInstance.close();
    expect(inst.open()).toBe(false);
  });

  it('teamFull()/hasTeam() are derived from the real team size', () => {
    const fixture = setup({ team: [member(1), member(2), member(3), member(4), member(5)] });
    const inst = fixture.componentInstance as any;
    expect(inst.hasTeam()).toBe(true);
    expect(inst.teamFull()).toBe(true);
  });

  it('isOnTeam()/isFavorite() check membership by pokemonId', () => {
    const fixture = setup({ team: [member(25)], favorites: [favorite(6)] });
    expect(fixture.componentInstance.isOnTeam(25)).toBe(true);
    expect(fixture.componentInstance.isOnTeam(999)).toBe(false);
    expect(fixture.componentInstance.isFavorite(6)).toBe(true);
    expect(fixture.componentInstance.isFavorite(999)).toBe(false);
  });

  it('toggleFavorite() adds when not favorited, and refreshes favorites on success', () => {
    const fixture = setup({ favorites: [] });
    fixture.componentInstance.toggleFavorite(25);
    expect(addFavorite).toHaveBeenCalledWith(25);
    expect(removeFavorite).not.toHaveBeenCalled();
  });

  it('toggleFavorite() removes when already favorited', () => {
    const fixture = setup({ favorites: [favorite(25)] });
    fixture.componentInstance.toggleFavorite(25);
    expect(removeFavorite).toHaveBeenCalledWith(25);
  });

  it('onAction() is a no-op when the Pokémon is already on the team', () => {
    const fixture = setup({ team: [member(25)] });
    fixture.componentInstance.onAction(25);
    expect(addToTeam).not.toHaveBeenCalled();
  });

  it('onAction() opens the swap flow instead of adding when the team is full', () => {
    const fixture = setup({ team: [member(1), member(2), member(3), member(4), member(5)] });
    fixture.componentInstance.onAction(99);

    expect(addToTeam).not.toHaveBeenCalled();
    expect((fixture.componentInstance as any).swapCandidateId()).toBe(99);
  });

  it('onAction() adds to team and closes the detail modal on success', () => {
    const fixture = setup({ team: [] });
    const inst = fixture.componentInstance as any;
    inst.selectedPokemonId.set(99);

    fixture.componentInstance.onAction(99);

    expect(addToTeam).toHaveBeenCalledWith(99);
    expect(inst.selectedPokemonId()).toBeNull();
  });

  it('onAction() opens the swap flow if addToTeam fails with TEAM_FULL (race condition)', () => {
    const fixture = setup({ team: [], addToTeamResult: { ok: false, reason: 'TEAM_FULL', message: 'full' } });
    fixture.componentInstance.onAction(99);

    expect((fixture.componentInstance as any).swapCandidateId()).toBe(99);
  });

  it('removeFromTeamModal() removes, refreshes the team, and closes the detail modal', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.selectedPokemonId.set(25);

    fixture.componentInstance.removeFromTeamModal(25);

    expect(removeFromTeam).toHaveBeenCalledWith(25);
    expect(inst.selectedPokemonId()).toBeNull();
  });

  it('closeSwap()/onSwapped() control the swap candidate state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.swapCandidateId.set(25);
    fixture.componentInstance.onSwapped();
    expect(inst.swapCandidateId()).toBeNull();
  });

  it('onCompareWithTeam()/closeCompareWithTeam() control the compare candidate state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.onCompareWithTeam(25);
    expect(inst.compareCandidateId()).toBe(25);
    fixture.componentInstance.closeCompareWithTeam();
    expect(inst.compareCandidateId()).toBeNull();
  });

  it('onCompareAdded()/onCompareSwapped() clear the compare candidate and close the detail modal', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.compareCandidateId.set(25);
    inst.selectedPokemonId.set(25);

    fixture.componentInstance.onCompareAdded();

    expect(inst.compareCandidateId()).toBeNull();
    expect(inst.selectedPokemonId()).toBeNull();
  });
});
