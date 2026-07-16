import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AssistantService } from '../../core/assistant';
import { TeamNameGeneratorModal } from './team-name-generator-modal';

describe('TeamNameGeneratorModal', () => {
  let generateTeamNames: ReturnType<typeof vi.fn>;

  function setup(inputs: { teamEmpty?: boolean; saving?: boolean } = {}, result: any = { ok: true, value: { names: ['Thunder Squad'], source: 'ai' } }) {
    generateTeamNames = vi.fn(() => of(result));
    TestBed.configureTestingModule({
      providers: [{ provide: AssistantService, useValue: { generateTeamNames } }],
    });
    const fixture = TestBed.createComponent(TeamNameGeneratorModal);
    fixture.componentInstance.teamEmpty = inputs.teamEmpty ?? false;
    fixture.componentInstance.saving = inputs.saving ?? false;
    fixture.detectChanges();
    return fixture;
  }

  it('selectStyle() updates the selected style', () => {
    const fixture = setup();
    (fixture.componentInstance as any).selectStyle('Funny');
    expect((fixture.componentInstance as any).selectedStyle()).toBe('Funny');
  });

  it('generate() is a no-op when the team is empty', () => {
    const fixture = setup({ teamEmpty: true });
    fixture.componentInstance.generate();
    expect(generateTeamNames).not.toHaveBeenCalled();
  });

  it('generate() is a no-op while already loading', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.loading.set(true);
    fixture.componentInstance.generate();
    expect(generateTeamNames).not.toHaveBeenCalled();
  });

  it('generate() populates suggestions and source on success', () => {
    const fixture = setup();
    fixture.componentInstance.generate();

    const inst = fixture.componentInstance as any;
    expect(generateTeamNames).toHaveBeenCalledWith('Epic');
    expect(inst.suggestions()).toEqual(['Thunder Squad']);
    expect(inst.source()).toBe('ai');
    expect(inst.loading()).toBe(false);
  });

  it('generate() defaults source to "ai" when the server omits it', () => {
    const fixture = setup({}, { ok: true, value: { names: ['Thunder Squad'] } });
    fixture.componentInstance.generate();
    expect((fixture.componentInstance as any).source()).toBe('ai');
  });

  it('generate() surfaces the error message and leaves suggestions empty on failure', () => {
    const fixture = setup({}, { ok: false, message: "We've hit today's AI usage limit — please try again tomorrow." });
    fixture.componentInstance.generate();

    const inst = fixture.componentInstance as any;
    expect(inst.generationError()).toBe("We've hit today's AI usage limit — please try again tomorrow.");
    expect(inst.suggestions()).toEqual([]);
  });

  it('useThisName() emits nameSelected when not saving', () => {
    const fixture = setup();
    let emitted: string | undefined;
    fixture.componentInstance.nameSelected.subscribe((n) => (emitted = n));

    fixture.componentInstance.useThisName('Thunder Squad');

    expect(emitted).toBe('Thunder Squad');
  });

  it('useThisName() is a no-op while saving', () => {
    const fixture = setup({ saving: true });
    let emitted = false;
    fixture.componentInstance.nameSelected.subscribe(() => (emitted = true));

    fixture.componentInstance.useThisName('Thunder Squad');

    expect(emitted).toBe(false);
  });

  it('close() emits closed unless saving', () => {
    const fixture = setup();
    let emitted = false;
    fixture.componentInstance.closed.subscribe(() => (emitted = true));
    fixture.componentInstance.close();
    expect(emitted).toBe(true);
  });

  it('close() is a no-op while saving', () => {
    const fixture = setup({ saving: true });
    let emitted = false;
    fixture.componentInstance.closed.subscribe(() => (emitted = true));
    fixture.componentInstance.close();
    expect(emitted).toBe(false);
  });
});
