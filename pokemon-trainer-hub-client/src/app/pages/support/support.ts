import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@auth0/auth0-angular';
import { SupportService } from '../../core/support';
import { ThemeService } from '../../shared/theme';

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  { q: 'How do I add Pokémon to my Dream Team?', a: 'Go to Explorer, choose a Pokémon, and click Add to Team. Your Dream Team can include up to 5 Pokémon.' },
  { q: "Why can't I add more than 5 Pokémon?", a: 'The Dream Team is limited to 5 Pokémon so you can build a focused and balanced team.' },
  { q: 'Can I remove Pokémon from my Dream Team?', a: 'Yes. You can manage your team from My Team or Manage My Team and remove Pokémon when needed.' },
  { q: 'What are Favorites?', a: 'Favorites let you save Pokémon you like so you can come back to them later.' },
  { q: 'What does the Starter Quiz do?', a: 'The Starter Quiz recommends Pokémon based on your trainer style and preferences.' },
  { q: 'Is the Battle feature an official Pokémon battle system?', a: 'No. The battle feature is a simplified educational simulation based on stats, type advantage, and a small luck factor.' },
  { q: 'Why do I need to log in?', a: 'Logging in lets us save your trainer profile, Dream Team, and Favorites across sessions.' },
  { q: 'Where does the Pokémon data come from?', a: 'Pokémon data is provided by PokéAPI.' },
];

const TOPICS = ['Account / Login', 'Dream Team', 'Favorites', 'Starter Quiz', 'Battle', 'Bug Report', 'Other'];

interface SupportForm {
  name: string;
  email: string;
  topic: string;
  message: string;
}

function emptyForm(): SupportForm {
  return { name: '', email: '', topic: '', message: '' };
}

@Component({
  selector: 'app-support',
  imports: [FormsModule],
  templateUrl: './support.html',
  styleUrl: './support.css',
})
export class Support {
  private readonly supportService = inject(SupportService);
  private readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);

  protected readonly faqs = FAQS;
  protected readonly openFaqIndex = signal<number | null>(null);
  protected readonly topics = TOPICS;

  private readonly authUser = toSignal(this.auth.user$, { initialValue: null });

  protected readonly form = signal<SupportForm>(emptyForm());

  // Pre-fills the real Auth0 email once it resolves — still a plain editable
  // field, not read-only, and only fills it in while the field is still
  // empty so it never overwrites something the trainer already typed.
  constructor() {
    effect(() => {
      const email = this.authUser()?.email;
      if (email && !this.form().email) {
        this.form.update((f) => ({ ...f, email }));
      }
    });
  }
  protected readonly submitted = signal(false);
  protected readonly sending = signal(false);
  protected readonly tried = signal(false);
  protected readonly submitError = signal<string | null>(null);

  protected readonly emailOk = computed(() => /.+@.+\..+/.test(this.form().email.trim()));
  protected readonly emailErr = computed(() => this.tried() && !this.emailOk());
  protected readonly topicErr = computed(() => this.tried() && !this.form().topic);
  protected readonly msgErr = computed(() => this.tried() && !this.form().message.trim());

  // Plain <a href="#faq">/<a href="#contact"> looked right but actually broke:
  // with <base href="/"> in index.html, a fragment-only href resolves against
  // that base, not the current path, so clicking it from /support navigated
  // to "/#faq" (the Landing route) instead of scrolling within this page.
  scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  toggleFaq(index: number): void {
    this.openFaqIndex.set(this.openFaqIndex() === index ? null : index);
  }

  updateField(field: 'name' | 'email' | 'message', value: string): void {
    this.form.update((f) => ({ ...f, [field]: value }));
  }

  pickTopic(topic: string): void {
    this.form.update((f) => ({ ...f, topic }));
  }

  submit(): void {
    const f = this.form();
    if (!this.emailOk() || !f.topic || !f.message.trim()) {
      this.tried.set(true);
      return;
    }

    this.sending.set(true);
    this.submitError.set(null);

    this.supportService.submit(f).subscribe((ok) => {
      this.sending.set(false);
      if (ok) {
        this.submitted.set(true);
      } else {
        this.submitError.set('Something went wrong sending your request. Please try again.');
      }
    });
  }

  resetForm(): void {
    this.submitted.set(false);
    this.tried.set(false);
    this.submitError.set(null);
    this.form.set(emptyForm());
  }
}
