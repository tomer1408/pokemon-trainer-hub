import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminDatabaseService } from '../../../core/admin-database';
import { AdminDatabase } from './database';

describe('AdminDatabase', () => {
  let listTables: ReturnType<typeof vi.fn>;
  let listRecords: ReturnType<typeof vi.fn>;
  let getRecord: ReturnType<typeof vi.fn>;

  function tables() {
    return [
      { key: 'trainerProfiles', label: 'Trainer Profiles', description: 'desc', count: 2 },
      { key: 'battleMatches', label: 'Battle Matches', description: 'desc', count: 5 },
    ];
  }

  function rows() {
    return [
      { id: 1, trainerName: 'Ash' },
      { id: 2, trainerName: 'Misty' },
    ];
  }

  function setup() {
    listTables = vi.fn(() => of(tables()));
    listRecords = vi.fn(() => of({ results: rows(), page: 1, pageSize: 20, total: 2 }));
    getRecord = vi.fn(() => of({ id: 1, trainerName: 'Ash' }));

    TestBed.configureTestingModule({
      providers: [{ provide: AdminDatabaseService, useValue: { listTables, listRecords, getRecord } }],
    });
    const fixture = TestBed.createComponent(AdminDatabase);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => vi.useRealTimers());

  it('loads real tables and auto-selects the first one', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    expect(inst.tables().length).toBe(2);
    expect(inst.selectedTable()).toBe('trainerProfiles');
    expect(listRecords).toHaveBeenCalledWith('trainerProfiles', { search: '', page: 1, pageSize: 20 });
  });

  it('shows a real error state when the row request fails', () => {
    listRecords = vi.fn(() => throwError(() => new Error('down')));
    TestBed.configureTestingModule({
      providers: [{ provide: AdminDatabaseService, useValue: { listTables, listRecords, getRecord } }],
    });
    const fixture = TestBed.createComponent(AdminDatabase);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).loadError()).toBe(true);
  });

  it('selectTable() switches the real active table and resets to page 1', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.setPage(3);

    inst.selectTable('battleMatches');
    fixture.detectChanges();

    expect(inst.selectedTable()).toBe('battleMatches');
    expect(inst.page()).toBe(1);
  });

  it('openRecord() fetches the real detail for the clicked row', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;

    inst.openRecord(rows()[0]);

    expect(getRecord).toHaveBeenCalledWith('trainerProfiles', 1);
    expect(inst.selectedRecord()).toEqual({ id: 1, trainerName: 'Ash' });
    expect(inst.selectedIndex()).toBe(0);
  });

  it('navigateDetail() moves within the real currently-loaded rows, not past the edges', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.openRecord(rows()[0]);

    inst.navigateDetail(1);
    expect(getRecord).toHaveBeenLastCalledWith('trainerProfiles', 2);

    getRecord.mockClear();
    inst.navigateDetail(1);
    expect(getRecord).not.toHaveBeenCalled();
  });

  it('closeDrawer() clears the selected record', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    inst.openRecord(rows()[0]);

    inst.closeDrawer();

    expect(inst.selectedRecord()).toBeNull();
    expect(inst.selectedIndex()).toBeNull();
  });

  it('detailFields() pretty-prints a real JSON-looking field and leaves plain fields alone', () => {
    getRecord = vi.fn(() => of({ id: 1, opponentName: 'Team Rocket', roundsJson: '[{"round":1}]' }));
    TestBed.configureTestingModule({
      providers: [{ provide: AdminDatabaseService, useValue: { listTables, listRecords, getRecord } }],
    });
    const fixture = TestBed.createComponent(AdminDatabase);
    fixture.detectChanges();
    const inst = fixture.componentInstance as any;

    inst.openRecord(rows()[0]);
    const fields = inst.detailFields();

    const jsonField = fields.find((f: any) => f.key === 'roundsJson');
    const plainField = fields.find((f: any) => f.key === 'opponentName');
    expect(jsonField.isJson).toBe(true);
    expect(jsonField.value).toContain('\n');
    expect(plainField.isJson).toBe(false);
    expect(plainField.value).toBe('Team Rocket');
  });

  it('debounces search input before refetching', () => {
    vi.useFakeTimers();
    const fixture = setup();
    listRecords.mockClear();

    (fixture.componentInstance as any).searchInput.set('ash');
    expect(listRecords).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    expect(listRecords).toHaveBeenCalled();
    const lastCall = listRecords.mock.calls[listRecords.mock.calls.length - 1];
    expect(lastCall[1].search).toBe('ash');
  });
});
