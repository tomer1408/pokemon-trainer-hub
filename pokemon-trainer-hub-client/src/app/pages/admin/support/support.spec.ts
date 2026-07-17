import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminSupportService, SupportRequestDetail } from '../../../core/admin-support';
import { AdminSupport } from './support';

describe('AdminSupport', () => {
  let list: ReturnType<typeof vi.fn>;
  let getById: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;

  function detail(overrides: Partial<SupportRequestDetail> = {}): SupportRequestDetail {
    return {
      id: 1,
      auth0UserId: 'auth0|trainer',
      name: 'Ash',
      email: 'ash@example.com',
      topic: 'Bug report',
      message: 'Something broke',
      status: 'open',
      priority: 'normal',
      adminNotes: null,
      assignedTo: null,
      resolvedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      history: [],
      ...overrides,
    };
  }

  function setup() {
    list = vi.fn(() => of({ results: [detail()], page: 1, pageSize: 10, total: 1 }));
    getById = vi.fn(() => of(detail()));
    update = vi.fn(() => of(detail({ status: 'resolved' })));

    TestBed.configureTestingModule({
      providers: [{ provide: AdminSupportService, useValue: { list, getById, update } }],
    });
    const fixture = TestBed.createComponent(AdminSupport);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => vi.useRealTimers());

  it('loads the first page on init', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    expect(list).toHaveBeenCalled();
    expect(inst.requests().length).toBe(1);
    expect(inst.isLoading()).toBe(false);
  });

  it('shows a real error state when the list request fails', () => {
    list = vi.fn(() => throwError(() => new Error('down')));
    TestBed.configureTestingModule({
      providers: [{ provide: AdminSupportService, useValue: { list, getById, update } }],
    });
    const fixture = TestBed.createComponent(AdminSupport);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).loadError()).toBe(true);
  });

  it('debounces search input before refetching', () => {
    vi.useFakeTimers();
    const fixture = setup();
    list.mockClear();

    (fixture.componentInstance as any).searchInput.set('ash');
    expect(list).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    expect(list).toHaveBeenCalled();
    const lastCall = list.mock.calls[list.mock.calls.length - 1][0];
    expect(lastCall.search).toBe('ash');
  });

  it('resets to page 1 when a filter changes', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.setPage(3);
    expect(inst.page()).toBe(3);

    inst.statusFilter.set('open');
    fixture.detectChanges();
    expect(inst.page()).toBe(1);
  });

  it('setPage() does not itself get reset back to 1', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    inst.setPage(2);

    expect(inst.page()).toBe(2);
  });

  it('openRequest() fetches the real detail and seeds the notes/assigned drafts', () => {
    const fixture = setup();
    getById.mockImplementationOnce(() => of(detail({ adminNotes: 'Called already', assignedTo: 'Misty' })));

    (fixture.componentInstance as any).openRequest(1);

    const inst = fixture.componentInstance as any;
    expect(inst.selected()?.id).toBe(1);
    expect(inst.notesDraft()).toBe('Called already');
    expect(inst.assignedDraft()).toBe('Misty');
  });

  it('closeDrawer() clears the selection', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.openRequest(1);
    expect(inst.selected()).not.toBeNull();

    inst.closeDrawer();
    expect(inst.selected()).toBeNull();
  });

  it('setStatus() is a no-op when the status is already the same', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.openRequest(1);
    update.mockClear();

    inst.setStatus('open'); // detail() already defaults to 'open'

    expect(update).not.toHaveBeenCalled();
  });

  it('setStatus() calls update() and merges the result into the selected request', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.openRequest(1);

    inst.setStatus('resolved');

    expect(update).toHaveBeenCalledWith(1, { status: 'resolved' });
    expect(inst.selected()?.status).toBe('resolved');
    expect(inst.savingStatusOrPriority()).toBe(false);
  });

  it('setPriority() calls update() with the priority patch', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.openRequest(1);

    inst.setPriority('urgent');

    expect(update).toHaveBeenCalledWith(1, { priority: 'urgent' });
  });

  it('markResolved() is shorthand for setStatus("resolved")', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.openRequest(1);

    inst.markResolved();

    expect(update).toHaveBeenCalledWith(1, { status: 'resolved' });
  });

  it('saveNotesAndAssignment() sends the current drafts', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.openRequest(1);
    inst.notesDraft.set('Called the trainer');
    inst.assignedDraft.set('Brock');

    inst.saveNotesAndAssignment();

    expect(update).toHaveBeenCalledWith(1, { adminNotes: 'Called the trainer', assignedTo: 'Brock' });
  });

  it('never sends the original message/name/email — only status/priority/adminNotes/assignedTo are ever mutated from this page', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.openRequest(1);

    inst.setStatus('resolved');

    const patch = update.mock.calls[0][1];
    expect(patch.message).toBeUndefined();
    expect(patch.name).toBeUndefined();
    expect(patch.email).toBeUndefined();
  });
});
