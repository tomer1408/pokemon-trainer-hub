import { TestBed } from '@angular/core/testing';
import { AuthService } from '@auth0/auth0-angular';
import { of } from 'rxjs';
import { SupportService } from '../../core/support';
import { Support } from './support';

describe('Support', () => {
  let submit: ReturnType<typeof vi.fn>;

  function setup(options: { authEmail?: string | null; submitResult?: boolean } = {}) {
    submit = vi.fn(() => of(options.submitResult ?? true));
    TestBed.configureTestingModule({
      providers: [
        { provide: SupportService, useValue: { submit } },
        { provide: AuthService, useValue: { user$: of(options.authEmail === undefined ? { email: 'ash@example.com' } : options.authEmail ? { email: options.authEmail } : null) } },
      ],
    });
    const fixture = TestBed.createComponent(Support);
    fixture.detectChanges();
    return fixture;
  }

  it('pre-fills the email field from the real Auth0 user once resolved', () => {
    const fixture = setup({ authEmail: 'ash@example.com' });
    expect((fixture.componentInstance as any).form().email).toBe('ash@example.com');
  });

  it('does not overwrite an email the trainer already typed', () => {
    const fixture = setup({ authEmail: null });
    const inst = fixture.componentInstance as any;
    inst.updateField('email', 'typed@example.com');
    fixture.detectChanges();
    expect(inst.form().email).toBe('typed@example.com');
  });

  it('toggleFaq() opens and closes (toggles) the same index', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.toggleFaq(2);
    expect(inst.openFaqIndex()).toBe(2);
    inst.toggleFaq(2);
    expect(inst.openFaqIndex()).toBeNull();
  });

  it('validation: emailOk/topicErr/msgErr only flag after a submit attempt', () => {
    const fixture = setup({ authEmail: null });
    const inst = fixture.componentInstance as any;
    expect(inst.emailErr()).toBe(false); // not tried yet

    inst.submit(); // invalid (no email/topic/message) -> sets tried

    expect(inst.emailErr()).toBe(true);
    expect(inst.topicErr()).toBe(true);
    expect(inst.msgErr()).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it('submit() is blocked by an invalid email even with topic/message filled', () => {
    const fixture = setup({ authEmail: null });
    const inst = fixture.componentInstance as any;
    inst.updateField('email', 'not-an-email');
    inst.pickTopic('Bug Report');
    inst.updateField('message', 'It broke.');

    inst.submit();

    expect(submit).not.toHaveBeenCalled();
    expect(inst.emailErr()).toBe(true);
  });

  it('submit() succeeds and sets submitted() once every field is valid', () => {
    const fixture = setup({ authEmail: null });
    const inst = fixture.componentInstance as any;
    inst.updateField('email', 'ash@example.com');
    inst.pickTopic('Bug Report');
    inst.updateField('message', 'It broke.');

    inst.submit();

    expect(submit).toHaveBeenCalledWith({ name: '', email: 'ash@example.com', topic: 'Bug Report', message: 'It broke.' });
    expect(inst.submitted()).toBe(true);
    expect(inst.sending()).toBe(false);
  });

  it('submit() surfaces a real error message when the server call fails', () => {
    const fixture = setup({ authEmail: null, submitResult: false });
    const inst = fixture.componentInstance as any;
    inst.updateField('email', 'ash@example.com');
    inst.pickTopic('Bug Report');
    inst.updateField('message', 'It broke.');

    inst.submit();

    expect(inst.submitted()).toBe(false);
    expect(inst.submitError()).toBe('Something went wrong sending your request. Please try again.');
  });

  it('resetForm() clears the form and all submission flags', () => {
    const fixture = setup({ authEmail: null });
    const inst = fixture.componentInstance as any;
    inst.updateField('email', 'ash@example.com');
    inst.pickTopic('Bug Report');
    inst.updateField('message', 'It broke.');
    inst.submit();

    inst.resetForm();

    expect(inst.submitted()).toBe(false);
    expect(inst.tried()).toBe(false);
    expect(inst.submitError()).toBeNull();
    expect(inst.form()).toEqual({ name: '', email: '', topic: '', message: '' });
  });
});
