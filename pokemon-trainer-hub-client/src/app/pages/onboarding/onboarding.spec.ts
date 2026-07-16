import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProfileService } from '../../core/profile';
import { AvatarIconsService, AvatarIconOption } from '../../core/avatar-icons';
import { Onboarding } from './onboarding';

describe('Onboarding', () => {
  let saveProfile: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  const icons: AvatarIconOption[] = [
    { pokemonId: 25, name: 'pikachu', category: 'popular', spriteUrl: 's' },
    { pokemonId: 4, name: 'charmander', category: 'fire', spriteUrl: 's' },
  ];

  function fillValidForm(inst: any) {
    inst.updateField('firstName', 'Ash');
    inst.updateField('lastName', 'Ketchum');
    inst.updateField('trainerName', 'AshK');
    inst.updateField('dateOfBirth', '2000-01-01');
    inst.updateField('country', 'Japan');
    inst.toggleAcceptedPolicy();
  }

  function setup(options: { saveError?: any } = {}) {
    saveProfile = vi.fn(() => (options.saveError ? throwError(() => options.saveError) : of({} as any)));
    navigateByUrl = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: ProfileService, useValue: { saveProfile } },
        { provide: AvatarIconsService, useValue: { getAvatarIcons: () => of(icons) } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    const fixture = TestBed.createComponent(Onboarding);
    fixture.detectChanges();
    return fixture;
  }

  it('categories() only lists categories that actually have icons in them', () => {
    const fixture = setup();
    const cats = (fixture.componentInstance as any).categories();
    expect(cats).toContain('popular');
    expect(cats).toContain('fire');
    expect(cats).not.toContain('water');
  });

  it('iconsInCategory() filters to the selected category', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.selectCategory('fire');
    expect(inst.iconsInCategory()).toEqual([icons[1]]);
  });

  it('selectIcon() sets avatarPokemonId on the form', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.selectIcon(25);
    expect(inst.form().avatarPokemonId).toBe(25);
  });

  it('countryOpen: toggle/close/select, and Escape closes it', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.toggleCountryOpen();
    expect(inst.countryOpen()).toBe(true);
    inst.onEscape();
    expect(inst.countryOpen()).toBe(false);

    inst.selectCountry('Japan');
    expect(inst.form().country).toBe('Japan');
    expect(inst.countryOpen()).toBe(false);
  });

  it('dobError(): required, future-date, and under-minimum-age messages', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.dobError()).toBe('Date of birth is required');

    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    inst.updateField('dateOfBirth', future.toISOString().slice(0, 10));
    expect(inst.dobError()).toBe('Date of birth cannot be in the future.');

    const tooYoung = new Date();
    tooYoung.setFullYear(tooYoung.getFullYear() - 5);
    inst.updateField('dateOfBirth', tooYoung.toISOString().slice(0, 10));
    expect(inst.dobError()).toBe('You must be at least 13 years old to create a Trainer Hub profile.');

    inst.updateField('dateOfBirth', '2000-01-01');
    expect(inst.dobError()).toBe('');
  });

  it('canSubmit() requires every field the backend actually requires, including policy acceptance', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.canSubmit()).toBe(false);

    fillValidForm(inst);

    expect(inst.canSubmit()).toBe(true);
  });

  it('canSubmit() is false without accepting the policy, even with every other field valid', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.updateField('firstName', 'Ash');
    inst.updateField('lastName', 'Ketchum');
    inst.updateField('trainerName', 'AshK');
    inst.updateField('dateOfBirth', '2000-01-01');
    inst.updateField('country', 'Japan');

    expect(inst.canSubmit()).toBe(false);
  });

  it('submitProfile() is blocked and shows field errors when invalid, without calling the backend', () => {
    const fixture = setup();
    fixture.componentInstance.submitProfile();

    expect(saveProfile).not.toHaveBeenCalled();
    expect((fixture.componentInstance as any).submitted()).toBe(true);
  });

  it('submitProfile() sends a null teamName when left blank, and navigates to /home on success', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fillValidForm(inst);

    fixture.componentInstance.submitProfile();

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ teamName: null, trainerName: 'AshK' }));
    expect(navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('submitProfile() surfaces the server\'s specific validation message on a 400', () => {
    const fixture = setup({ saveError: { status: 400, error: { message: 'Date of birth cannot be in the future.' } } });
    const inst = fixture.componentInstance as any;
    fillValidForm(inst);

    fixture.componentInstance.submitProfile();

    expect(inst.submitError()).toBe('Date of birth cannot be in the future.');
    expect(inst.submitting()).toBe(false);
  });

  it('submitProfile() falls back to a generic message for a non-400 failure', () => {
    const fixture = setup({ saveError: { status: 500 } });
    const inst = fixture.componentInstance as any;
    fillValidForm(inst);

    fixture.componentInstance.submitProfile();

    expect(inst.submitError()).toBe('Something went wrong saving your profile. Please try again.');
  });

  it('showPolicy()/closePolicy() control the open policy modal', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    fixture.componentInstance.showPolicy('privacy');
    expect(inst.openPolicyModal()).toBe('privacy');
    fixture.componentInstance.closePolicy();
    expect(inst.openPolicyModal()).toBeNull();
  });
});
