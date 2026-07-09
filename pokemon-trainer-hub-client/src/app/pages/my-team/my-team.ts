import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { TeamService, DreamTeamMember } from '../../core/team';
import { FavoritesService, FavoritePokemon } from '../../core/favorites';
import { getStrongestMember, getTeamPower, getTeamTier } from '../../shared/team-power';
import { POKEMON_TYPES, TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';
import { PokemonDetailModal } from '../../shared/pokemon-detail-modal/pokemon-detail-modal';

const MAX_TEAM_SIZE = 5;

interface TypeSegment {
  type: PokemonTypeName;
  pct: number;
}

@Component({
  selector: 'app-my-team',
  imports: [RouterLink, PokemonDetailModal],
  templateUrl: './my-team.html',
  styleUrl: './my-team.css',
})
export class MyTeam {
  private readonly teamService = inject(TeamService);
  private readonly favoritesService = inject(FavoritesService);
  protected readonly theme = inject(ThemeService);

  protected readonly pendingRemove = signal<{ id: number; name: string } | null>(null);
  protected readonly selectedPokemonId = signal<number | null>(null);
  private readonly teamRefresh = signal(0);
  private readonly favoritesRefresh = signal(0);

  protected readonly team = toSignal(
    toObservable(this.teamRefresh).pipe(switchMap(() => this.teamService.getTeam())),
  );

  protected readonly favorites = toSignal(
    toObservable(this.favoritesRefresh).pipe(switchMap(() => this.favoritesService.getFavorites())),
    { initialValue: [] as FavoritePokemon[] },
  );

  protected readonly isLoading = computed(() => this.team() === undefined);
  protected readonly teamCount = computed(() => this.team()?.length ?? 0);
  protected readonly hasTeam = computed(() => this.teamCount() > 0);

  protected readonly slots = computed(() => {
    const team = this.team() ?? [];
    return Array.from({ length: MAX_TEAM_SIZE }, (_, i) => team[i] ?? null);
  });

  protected readonly tier = computed(() => getTeamTier(this.teamCount()));
  protected readonly totalPower = computed(() => getTeamPower(this.team() ?? []));
  protected readonly averagePower = computed(() =>
    this.hasTeam() ? Math.round(this.totalPower() / this.teamCount()) : 0,
  );
  protected readonly strongest = computed(() => getStrongestMember(this.team() ?? []));

  protected readonly maxMemberPower = computed(() =>
    Math.max(1, ...(this.team() ?? []).map((m) => m.baseExperience)),
  );
  protected readonly breakdownRows = computed(() =>
    [...(this.team() ?? [])].sort((a, b) => b.baseExperience - a.baseExperience),
  );

  // Dual-type Pokémon count toward BOTH types, normalized so the segments sum
  // to 100% — per the product spec (not the mockup's fake single-type data).
  protected readonly typeSegments = computed<TypeSegment[]>(() => {
    const team = this.team() ?? [];
    const counts = new Map<string, number>();
    let total = 0;
    for (const member of team) {
      for (const type of member.types) {
        counts.set(type, (counts.get(type) ?? 0) + 1);
        total += 1;
      }
    }
    if (total === 0) return [];
    return Array.from(counts.entries()).map(([type, count]) => ({
      type: type as PokemonTypeName,
      pct: Math.round((count / total) * 100),
    }));
  });

  protected readonly presentTypes = computed(() => this.typeSegments().map((s) => s.type));
  protected readonly missingTypes = computed(() =>
    POKEMON_TYPES.filter((t) => !this.presentTypes().includes(t)),
  );

  protected readonly insightText = computed(() => {
    if (!this.hasTeam()) return '';
    const present = this.presentTypes();
    const missing = this.missingTypes();
    if (missing.length === 0) return 'Full type coverage — nothing can catch this team off guard.';
    const shown = missing.slice(0, 3).join(', ');
    return `Solid coverage in ${present.join(', ')} — but you're lacking ${shown}${missing.length > 3 ? ', and more' : ''}.`;
  });

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  isFavorite(pokemonId: number): boolean {
    return this.favorites().some((f) => f.pokemonId === pokemonId);
  }

  toggleFavorite(pokemonId: number): void {
    const obs = this.isFavorite(pokemonId)
      ? this.favoritesService.removeFavorite(pokemonId)
      : this.favoritesService.addFavorite(pokemonId);
    obs.subscribe(() => this.favoritesRefresh.update((n) => n + 1));
  }

  openDetail(pokemonId: number): void {
    this.selectedPokemonId.set(pokemonId);
  }

  closeDetail(): void {
    this.selectedPokemonId.set(null);
  }

  requestRemove(member: DreamTeamMember): void {
    this.pendingRemove.set({ id: member.pokemonId, name: member.pokemonName });
  }

  confirmRemove(): void {
    const target = this.pendingRemove();
    if (!target) return;
    this.teamService.removeFromTeam(target.id).subscribe(() => {
      this.teamRefresh.update((n) => n + 1);
      this.pendingRemove.set(null);
    });
  }

  cancelRemove(): void {
    this.pendingRemove.set(null);
  }
}
