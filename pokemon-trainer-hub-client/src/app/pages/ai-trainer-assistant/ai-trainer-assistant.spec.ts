import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AssistantService } from '../../core/assistant';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { AiTrainerAssistant } from './ai-trainer-assistant';

describe('AiTrainerAssistant', () => {
  let analyzeTeam: ReturnType<typeof vi.fn>;
  let query: ReturnType<typeof vi.fn>;
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
    analyzeResult?: any;
    queryResult?: any;
    addToTeamResult?: any;
  } = {}) {
    analyzeTeam = vi.fn(() => of(options.analyzeResult ?? { ok: true, value: { type: 'electric', reasoning: 'Balanced.', pokemon: null } }));
    query = vi.fn(() => of(options.queryResult ?? { ok: true, value: { type: 'fire', reasoning: 'Fiery.', pokemon: null } }));
    getTeam = vi.fn(() => of(options.team ?? []));
    addToTeam = vi.fn(() => of(options.addToTeamResult ?? { ok: true }));
    removeFromTeam = vi.fn(() => of(undefined));
    getFavorites = vi.fn(() => of(options.favorites ?? []));
    addFavorite = vi.fn(() => of(true));
    removeFavorite = vi.fn(() => of(true));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AssistantService, useValue: { analyzeTeam, query } },
        { provide: TeamService, useValue: { getTeam, addToTeam, removeFromTeam } },
        { provide: FavoritesService, useValue: { getFavorites, addFavorite, removeFavorite } },
      ],
    });
    const fixture = TestBed.createComponent(AiTrainerAssistant);
    fixture.detectChanges();
    return fixture;
  }

  it('runs the real team analysis automatically on load', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(analyzeTeam).toHaveBeenCalled();
    expect(inst.analysisResult()).toEqual({ type: 'electric', reasoning: 'Balanced.', pokemon: null });
    expect(inst.analysisLoading()).toBe(false);
  });

  it('surfaces the real server error message when analysis fails', () => {
    const fixture = setup({ analyzeResult: { ok: false, message: "We've hit today's AI usage limit — please try again tomorrow." } });
    const inst = fixture.componentInstance as any;
    expect(inst.analysisResult()).toBeNull();
    expect(inst.analysisError()).toBe("We've hit today's AI usage limit — please try again tomorrow.");
  });

  it('onRerollAnalysis() re-runs the real analysis', () => {
    const fixture = setup();
    fixture.componentInstance.onRerollAnalysis();
    expect(analyzeTeam).toHaveBeenCalledTimes(2);
  });

  it('setTabAnalyze()/setTabFind() switch tabs', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.setTabFind();
    expect(inst.isFindTab()).toBe(true);
    expect(inst.isAnalyzeTab()).toBe(false);
    fixture.componentInstance.setTabAnalyze();
    expect(inst.isAnalyzeTab()).toBe(true);
  });

  it('noQuery() reflects whether the draft is empty/whitespace', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.noQuery()).toBe(true);
    inst.queryText.set('  ');
    expect(inst.noQuery()).toBe(true);
    inst.queryText.set('a fire type');
    expect(inst.noQuery()).toBe(false);
  });

  it('send() is a no-op for an empty query', () => {
    const fixture = setup();
    fixture.componentInstance.send();
    expect(query).not.toHaveBeenCalled();
  });

  it('send() appends the user message, queries the server, then appends the real recommendation', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.queryText.set('a strong fire type');

    fixture.componentInstance.send();

    expect(query).toHaveBeenCalledWith('a strong fire type');
    expect(inst.chatMessages().at(-2)).toEqual({ role: 'user', text: 'a strong fire type' });
    expect(inst.chatMessages().at(-1)).toEqual(
      expect.objectContaining({ role: 'assistant', recType: 'fire', recReasoning: 'Fiery.' }),
    );
    expect(inst.queryText()).toBe('');
    expect(inst.isThinking()).toBe(false);
  });

  it('send() appends the server error message as plain assistant text on failure', () => {
    const fixture = setup({ queryResult: { ok: false, message: 'The AI assistant is unavailable right now. Please try again later.' } });
    const inst = fixture.componentInstance as any;
    inst.queryText.set('a strong fire type');

    fixture.componentInstance.send();

    expect(inst.chatMessages().at(-1)).toEqual({ role: 'assistant', text: 'The AI assistant is unavailable right now. Please try again later.' });
  });

  it('teamFull()/hasTeam() and isOnTeam()/isFavorite() reflect real team/favorites state', () => {
    const fixture = setup({
      team: [member(1), member(2), member(3), member(4), member(5)],
      favorites: [favorite(6)],
    });
    const inst = fixture.componentInstance;
    expect((inst as any).teamFull()).toBe(true);
    expect((inst as any).hasTeam()).toBe(true);
    expect(inst.isOnTeam(1)).toBe(true);
    expect(inst.isFavorite(6)).toBe(true);
    expect(inst.isFavorite(999)).toBe(false);
  });

  it('addToTeam() is a no-op when the Pokémon is already on the team', () => {
    const alreadyOn = setup({ team: [member(1)] });
    alreadyOn.componentInstance.addToTeam(1);
    expect(addToTeam).not.toHaveBeenCalled();
  });

  it('addToTeam() opens the swap flow instead of adding when the team is full', () => {
    const full = setup({ team: [member(1), member(2), member(3), member(4), member(5)] });
    full.componentInstance.addToTeam(99);
    expect((full.componentInstance as any).swapCandidateId()).toBe(99);
    expect(addToTeam).not.toHaveBeenCalled();
  });

  it('addToTeam() adds and closes the detail modal when there is room', () => {
    const empty = setup({ team: [] });
    const inst = empty.componentInstance as any;
    inst.selectedPokemonId.set(99);
    empty.componentInstance.addToTeam(99);
    expect(addToTeam).toHaveBeenCalledWith(99);
    expect(inst.selectedPokemonId()).toBeNull();
  });

  it('addToTeam() opens the swap flow if the add fails with TEAM_FULL (race condition)', () => {
    const fixture = setup({ team: [], addToTeamResult: { ok: false, reason: 'TEAM_FULL', message: 'full' } });
    fixture.componentInstance.addToTeam(99);
    expect((fixture.componentInstance as any).swapCandidateId()).toBe(99);
  });

  it('removeFromTeamModal()/closeSwap()/onSwapped() control team refresh and modal state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.selectedPokemonId.set(1);
    fixture.componentInstance.removeFromTeamModal(1);
    expect(removeFromTeam).toHaveBeenCalledWith(1);
    expect(inst.selectedPokemonId()).toBeNull();

    inst.swapCandidateId.set(5);
    fixture.componentInstance.onSwapped();
    expect(inst.swapCandidateId()).toBeNull();
  });

  it('onCompareWithTeam()/closeCompareWithTeam()/onCompareAdded()/onCompareSwapped() control compare state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.onCompareWithTeam(5);
    expect(inst.compareCandidateId()).toBe(5);

    inst.selectedPokemonId.set(5);
    fixture.componentInstance.onCompareAdded();
    expect(inst.compareCandidateId()).toBeNull();
    expect(inst.selectedPokemonId()).toBeNull();
  });

  it('toggleFavorite() adds/removes and refreshes on success', () => {
    const fixture = setup({ favorites: [] });
    fixture.componentInstance.toggleFavorite(25);
    expect(addFavorite).toHaveBeenCalledWith(25);
  });
});
