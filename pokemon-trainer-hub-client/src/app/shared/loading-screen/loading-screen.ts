import { Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';

const MESSAGES = [
  'Searching the tall grass',
  'Calculating team power',
  'Polishing type badges',
  'Syncing your Dream Team',
  'Waking up the Pokédex',
];

export type LoadingScreenSize = 'sm' | 'md' | 'lg';

interface SizeConfig {
  core: number;
  dot: number;
  gap: number;
}

const SIZES: Record<LoadingScreenSize, SizeConfig> = {
  sm: { core: 34, dot: 12, gap: 12 },
  md: { core: 58, dot: 14, gap: 20 },
  lg: { core: 78, dot: 16, gap: 24 },
};

// A reusable loading indicator, not a whole page — most callers embed it
// inside their own content area (fullScreen: false, the default) so it fills
// the space it's given instead of covering the Navbar. fullScreen is only for
// a true full-viewport takeover (fixed, above everything).
@Component({
  selector: 'app-loading-screen',
  templateUrl: './loading-screen.html',
  styleUrl: './loading-screen.css',
})
export class LoadingScreen implements OnInit, OnDestroy {
  readonly isLight = input(false);
  readonly isPikachu = input(false);
  readonly fullScreen = input(false);
  readonly size = input<LoadingScreenSize>('md');
  // Toggles the bouncing Pokéball itself (not a progress bar).
  readonly showProgress = input(true);
  readonly showWordmark = input(true);
  readonly message = input<string | null>(null);
  // Lets a specific page rotate through its own flavor of tips (e.g. Home's
  // "Warming up the arena…") instead of the generic default list below.
  readonly messages = input<string[]>(MESSAGES);

  protected readonly messageIndex = signal(0);

  protected readonly sizeConfig = computed<SizeConfig>(() => SIZES[this.size()]);
  protected readonly currentMessage = computed(() => this.message() || this.messages()[this.messageIndex()]);

  protected readonly ballSize = computed(() => Math.round(this.sizeConfig().core * 0.9));
  protected readonly ballBandHeight = computed(() => Math.max(3, Math.round(this.ballSize() * 0.09)));
  protected readonly ballButtonSize = computed(() => Math.round(this.ballSize() * 0.34));
  protected readonly ballShadowWidth = computed(() => Math.round(this.ballSize() * 0.8));
  protected readonly ballShadowHeight = computed(() => Math.round(this.ballSize() * 0.22));
  protected readonly ballWrapHeight = computed(() => this.ballSize() + 46);

  protected readonly dotSize = computed(() => Math.round(this.sizeConfig().dot * 0.36));
  protected readonly wordmarkFontSize = computed(() => (this.size() === 'sm' ? 11 : 15));
  protected readonly messageFontSize = computed(() => (this.size() === 'sm' ? 11 : 13));

  private messageTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.messageTimer = setInterval(() => {
      this.messageIndex.update((i) => (i + 1) % this.messages().length);
    }, 1900);
  }

  ngOnDestroy(): void {
    clearInterval(this.messageTimer);
  }
}
