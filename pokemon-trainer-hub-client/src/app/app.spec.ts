import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of } from 'rxjs';
import { API_BASE } from './core/api-base';
import { App } from './app';

@Component({ selector: 'app-dummy', template: '' })
class Dummy {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // The real AuthService talks to Auth0's SDK — stubbed here so the
        // component tree can be built without a live Auth0 config.
        { provide: AuthService, useValue: { isAuthenticated$: of(false) } },
      ],
    }).compileComponents();
    // Deliberately NOT injecting HttpTestingController here — doing so
    // instantiates the test module immediately, which then makes any
    // later TestBed.configureTestingModule() call in an individual test
    // (several below reconfigure with a different router/auth state) throw
    // "Cannot configure the test module when the test module has already
    // been instantiated." Each test grabs it fresh instead, right after
    // whichever configuration (this default one or its own) it actually uses.
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
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated$: of(true) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/support');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-navbar')).toBeNull();
  });

  it('logs session_started exactly once when a trainer is authenticated', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated$: of(true) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    const requests = httpMock.match(`${API_BASE}/events`);
    const sessionStartedCalls = requests.filter((r) => r.request.body.eventType === 'session_started');
    expect(sessionStartedCalls.length).toBe(1);
    requests.forEach((r) => r.flush({ id: 1 }));
  });

  it('never logs session_started or page_viewed for an unauthenticated visitor', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).expectNone(`${API_BASE}/events`);
  });

  it('logs page_viewed with the real, mapped page name on navigation to a tracked page', async () => {
    // /starter-quiz specifically: it's both a TRACKED_PAGE_NAMES entry AND
    // in NAVBAR_HIDDEN_ON, so <app-navbar> never renders here — Navbar
    // pulls in ProfileService/PokemonService/auth.user$, none of which this
    // minimal AuthService stub provides, so instantiating it would crash
    // for reasons unrelated to what this test actually checks.
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: 'starter-quiz', component: Dummy }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated$: of(true) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/starter-quiz');
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    const requests = httpMock.match(`${API_BASE}/events`);
    const pageViewCalls = requests.filter((r) => r.request.body.eventType === 'page_viewed');
    expect(pageViewCalls.some((r) => r.request.body.pageName === 'starter-quiz')).toBe(true);
    requests.forEach((r) => r.flush({ id: 1 }));
  });

  it('never logs page_viewed for an untracked route like /admin/**', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: 'admin', children: [{ path: 'support', component: Dummy }] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated$: of(true) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/support');
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    const requests = httpMock.match(`${API_BASE}/events`);
    const pageViewCalls = requests.filter((r) => r.request.body.eventType === 'page_viewed');
    expect(pageViewCalls.length).toBe(0);
    requests.forEach((r) => r.flush({ id: 1 }));
  });
});
