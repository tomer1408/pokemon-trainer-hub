import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { ProfileService } from '../../core/profile';
import { TeamService } from '../../core/team';
import { getTeamPower, getTeamTier } from '../../shared/team-power';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { ThemeService } from '../../shared/theme';

const MAX_TEAM_SIZE = 5;

@Component({
  selector: 'app-team-card',
  imports: [RouterLink],
  templateUrl: './team-card.html',
  styleUrl: './team-card.css',
})
export class TeamCard {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly teamService = inject(TeamService);
  protected readonly theme = inject(ThemeService);

  private readonly authUser = toSignal(this.auth.user$, { initialValue: null });
  private readonly profile = toSignal(this.profileService.getProfile(), { initialValue: null });
  protected readonly trainerName = computed(
    () => this.profile()?.trainerName ?? this.authUser()?.name ?? 'Trainer',
  );
  protected readonly trainerInitial = computed(() => this.trainerName().charAt(0).toUpperCase());

  protected readonly team = toSignal(this.teamService.getTeam(), { initialValue: [] });
  protected readonly teamCount = computed(() => this.team().length);
  protected readonly teamPower = computed(() => getTeamPower(this.team()));
  protected readonly tier = computed(() => getTeamTier(this.teamCount()));

  protected readonly slots = computed(() => {
    const team = this.team();
    return Array.from({ length: MAX_TEAM_SIZE }, (_, i) => team[i] ?? null);
  });

  protected readonly coverageTypes = computed(() => {
    const types = new Set<string>();
    this.team().forEach((m) => m.types.forEach((t) => types.add(t)));
    return Array.from(types);
  });

  typeColor(type: string): string {
    return TYPE_COLORS[type as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }
}
