import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from './api-base';
import { NotesService, TrainerNote } from './notes';

describe('NotesService', () => {
  let service: NotesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(NotesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getNotes() falls back to an empty array on error', () => {
    let result: TrainerNote[] | undefined;
    service.getNotes(25).subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/notes/25`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toEqual([]);
  });

  it('addNote() returns the created note on success', () => {
    const note: TrainerNote = { id: 1, pokemonId: 25, text: 'Fast!', createdAt: '2026-01-01' };
    let result: TrainerNote | null | undefined;
    service.addNote(25, 'Fast!').subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${API_BASE}/notes/25`);
    expect(req.request.body).toEqual({ text: 'Fast!' });
    req.flush(note);

    expect(result).toEqual(note);
  });

  it('addNote() resolves null on error instead of throwing', () => {
    let result: TrainerNote | null | undefined;
    service.addNote(25, 'Fast!').subscribe((r) => (result = r));

    httpMock.expectOne(`${API_BASE}/notes/25`).flush('error', { status: 500, statusText: 'Server Error' });

    expect(result).toBeNull();
  });

  it('deleteNote() resolves true on success, false on error', () => {
    let ok: boolean | undefined;
    service.deleteNote(1).subscribe((r) => (ok = r));

    const req = httpMock.expectOne(`${API_BASE}/notes/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(ok).toBe(true);
  });
});
