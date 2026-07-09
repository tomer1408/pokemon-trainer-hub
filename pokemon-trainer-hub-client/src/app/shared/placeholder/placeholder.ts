import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

// Generic stand-in for any route whose real page hasn't been built yet.
// Route config supplies the title via `data: { title: '...' }`.
@Component({
  selector: 'app-placeholder',
  template: `
    <div style="padding: 60px 40px; text-align: center; font-family: 'Manrope', sans-serif;">
      <h1 style="font-family: 'Bungee', sans-serif;">{{ title }}</h1>
      <p style="color: rgba(230,225,250,0.6);">This page is coming soon.</p>
    </div>
  `,
})
export class Placeholder {
  protected readonly title = inject(ActivatedRoute).snapshot.data['title'] ?? 'Coming soon';
}
