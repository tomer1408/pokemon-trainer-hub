import { Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, map, of, switchMap } from 'rxjs';
import { ProfileService, TrainerProfile } from '../../core/profile';
import { ColorblindService, COLORBLIND_MODE_OPTIONS } from '../../shared/colorblind';
import { ThemeService } from '../../shared/theme';
import { AppSettingsService } from '../../shared/app-settings';
import { PolicyModal, PolicyType } from '../../shared/policy-modal/policy-modal';
import { LoadingScreen } from '../../shared/loading-screen/loading-screen';
import { TYPE_COLORS, PokemonTypeName } from '../../shared/pokemon-types';
import { clearStarterQuizSkip } from '../../shared/quiz/quiz-completion';

type ProfileFetchStatus = 'ok' | 'missing' | 'error';

// Matches Settings.dc.html, with one structural change: Theme, Colorblind
// Mode, and Battle Explanations all apply instantly (same as the Navbar/
// Account Menu controls they share real services with) instead of being
// gated behind the Save bar — staging them in a draft would mean clicking
// a theme button here wouldn't match the instant feedback every other page
// already gives. The Save bar is only meaningful for the marketing email
// checkbox, since that's the one setting backed by a real API call that can
// actually fail. The mockup's fake Trainer ID/XP/Achievements equivalents
// don't appear here at all — same real-data-only approach as My Profile.
@Component({
  selector: 'app-settings',
  imports: [RouterLink, LoadingScreen, PolicyModal],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  private readonly profileService = inject(ProfileService);
  private readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly colorblind = inject(ColorblindService);
  protected readonly appSettings = inject(AppSettingsService);

  protected readonly colorblindModes = COLORBLIND_MODE_OPTIONS;

  private readonly profileRefresh = signal(0);
  private readonly profileResult = toSignal(
    toObservable(this.profileRefresh).pipe(
      switchMap(() =>
        this.profileService.getProfileStrict().pipe(
          map((profile) => ({ status: 'ok' as ProfileFetchStatus, profile })),
          catchError((err) =>
            of({
              status: (err?.status === 404 ? 'missing' : 'error') as ProfileFetchStatus,
              profile: null as TrainerProfile | null,
            }),
          ),
        ),
      ),
    ),
  );
  protected readonly profile = computed(() => this.profileResult()?.profile ?? null);
  protected readonly isLoading = computed(() => this.profileResult() === undefined);
  protected readonly hasError = computed(() => this.profileResult()?.status === 'error');
  protected readonly hasNoProfile = computed(() => this.profileResult()?.status === 'missing');

  protected readonly draftMarketing = signal<boolean | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly showSavedToast = signal(false);
  protected readonly openPolicyModal = signal<PolicyType | null>(null);

  protected readonly isDirty = computed(() => {
    const p = this.profile();
    const d = this.draftMarketing();
    return p !== null && d !== null && d !== p.marketingEmailsOptIn;
  });

  protected readonly formattedAcceptedPolicyAt = computed(() => {
    const at = this.profile()?.acceptedPolicyAt;
    if (!at) return null;
    return new Date(at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  });

  constructor() {
    effect(() => {
      const p = this.profile();
      if (p) this.draftMarketing.set(p.marketingEmailsOptIn);
    });
  }

  typeColor(type: string): string {
    return TYPE_COLORS[type.toLowerCase() as PokemonTypeName] ?? TYPE_COLORS['normal'];
  }

  retry(): void {
    this.profileRefresh.update((n) => n + 1);
  }

  toggleMarketing(): void {
    const cur = this.draftMarketing();
    if (cur !== null) this.draftMarketing.set(!cur);
  }

  showPolicy(type: PolicyType): void {
    this.openPolicyModal.set(type);
  }

  closePolicy(): void {
    this.openPolicyModal.set(null);
  }

  saveSettings(): void {
    const p = this.profile();
    const draft = this.draftMarketing();
    if (!p || draft === null || !this.isDirty() || this.saving()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const payload: TrainerProfile = {
      trainerName: p.trainerName,
      favoriteType: p.favoriteType,
      experienceLevel: p.experienceLevel,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      country: p.country,
      avatarPokemonId: p.avatarPokemonId,
      teamName: p.teamName,
      acceptedPolicy: p.acceptedPolicy,
      marketingEmailsOptIn: draft,
    };

    this.profileService.saveProfile(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.profileRefresh.update((n) => n + 1);
        this.showSavedToast.set(true);
        setTimeout(() => this.showSavedToast.set(false), 2400);
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set('Something went wrong saving your settings. Please try again.');
      },
    });
  }

  logOut(): void {
    clearStarterQuizSkip();
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } }).subscribe();
  }
}
