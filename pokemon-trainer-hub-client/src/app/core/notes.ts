import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE } from './api-base';

export interface TrainerNote {
  id: number;
  pokemonId: number;
  text: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly http = inject(HttpClient);

  // Falls back to an empty list (rather than erroring) so a transient API
  // problem doesn't block the rest of the Detail Modal from showing.
  getNotes(pokemonId: number): Observable<TrainerNote[]> {
    return this.http
      .get<TrainerNote[]>(`${API_BASE}/notes/${pokemonId}`)
      .pipe(catchError(() => of([])));
  }

  addNote(pokemonId: number, text: string): Observable<TrainerNote | null> {
    return this.http
      .post<TrainerNote>(`${API_BASE}/notes/${pokemonId}`, { text })
      .pipe(catchError(() => of(null)));
  }

  deleteNote(noteId: number): Observable<boolean> {
    return this.http.delete<void>(`${API_BASE}/notes/${noteId}`).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
