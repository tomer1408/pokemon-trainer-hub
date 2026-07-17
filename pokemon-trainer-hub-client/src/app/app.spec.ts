import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of } from 'rxjs';
import { App } from './app';

@Component({ selector: 'app-dummy', template: '' })
class Dummy {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        // The real AuthService talks to Auth0's SDK — stubbed here so the
        // component tree can be built without a live Auth0 config.
        { provide: AuthService, useValue: { isAuthenticated$: of(false) } },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('hides the navbar for an unauthenticated visitor', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-navbar')).toBeNull();
  });

  it('hides the regular navbar on every /admin route — AdminLayout has its own header/sidebar, and stacking both was a real bug', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: 'admin', children: [{ path: 'support', component: Dummy }] }]),
        { provide: AuthService, useValue: { isAuthenticated$: of(true) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/support');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-navbar')).toBeNull();
  });
});
