import { TestBed } from '@angular/core/testing';
import { PokemonSummary } from '../../core/pokemon';
import { SurpriseTeamModal } from './surprise-team-modal';

describe('SurpriseTeamModal', () => {
  function mon(overrides: Partial<PokemonSummary> = {}): PokemonSummary {
    return { id: 25, name: 'pikachu', baseExperience: 112, types: ['electric'], spriteUrl: 's', stats: [], ...overrides };
  }

  function setup(
    picks: PokemonSummary[] = [mon()],
    options: { isLoading?: boolean; usedFallback?: boolean } = {},
  ) {
    const fixture = TestBed.createComponent(SurpriseTeamModal);
    fixture.componentInstance.picks = picks;
    fixture.componentInstance.isLoading = options.isLoading ?? false;
    fixture.componentInstance.usedFallback = options.usedFallback ?? false;
    fixture.detectChanges();
    return fixture;
  }

  it('onCancel() emits closed', () => {
    const fixture = setup();
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));

    fixture.componentInstance.onCancel();

    expect(closed).toBe(true);
  });

  it('typeColor() falls back to the normal color for an unknown type', () => {
    const fixture = setup();
    expect(fixture.componentInstance.typeColor('not-a-type')).toBe(fixture.componentInstance.typeColor('normal'));
  });

  it('renders a card per pick and emits pickSelected with the real Pokémon on click', () => {
    const picks = [mon({ id: 1, name: 'bulbasaur' }), mon({ id: 4, name: 'charmander' })];
    const fixture = setup(picks);
    let selected: PokemonSummary | undefined;
    fixture.componentInstance.pickSelected.subscribe((p) => (selected = p));

    const cards = fixture.nativeElement.querySelectorAll('.pick-card');
    expect(cards.length).toBe(2);
    cards[1].click();

    expect(selected).toEqual(picks[1]);
  });

  it('shows the empty state and no cards when there are no picks left', () => {
    const fixture = setup([]);
    expect(fixture.nativeElement.querySelector('.pick-card')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("you've caught them all");
  });

  it('shows the loading state instead of the grid while isLoading is true', () => {
    const fixture = setup([mon()], { isLoading: true });

    expect(fixture.nativeElement.querySelector('.pick-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-loading-screen')).toBeTruthy();
  });

  it('shows the fallback note only when usedFallback is true', () => {
    const withoutFallback = setup();
    expect(withoutFallback.nativeElement.querySelector('.fallback-note')).toBeNull();

    const withFallback = setup([mon()], { usedFallback: true });
    expect(withFallback.nativeElement.querySelector('.fallback-note')).toBeTruthy();
  });

  it('shuffle button emits shuffle and is disabled while loading', () => {
    const fixture = setup();
    let shuffled = false;
    fixture.componentInstance.shuffle.subscribe(() => (shuffled = true));

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.shuffle-btn');
    btn.click();
    expect(shuffled).toBe(true);

    const loadingFixture = setup([mon()], { isLoading: true });
    const loadingBtn: HTMLButtonElement = loadingFixture.nativeElement.querySelector('.shuffle-btn');
    expect(loadingBtn.disabled).toBe(true);
  });
});
