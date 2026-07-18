import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { Component } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AdminService } from '../../../core/admin';
import { AdminSupportService } from '../../../core/admin-support';
import { AdminLayout } from './admin-layout';

@Component({ selector: 'app-dummy', template: '' })
class Dummy {}

describe('AdminLayout', () => {
  let hasPermission: ReturnType<typeof vi.fn>;
  let listSupport: ReturnType<typeof vi.fn>;

  function setup(options: { authUser?: { name?: string } | null } = {}) {
    hasPermission = vi.fn(() => true);
    listSupport = vi.fn(() => of({ results: [], page: 1, pageSize: 1, total: 27 }));
    const authUser = 'authUser' in options ? options.authUser : { name: 'A. Oak' };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'admin',
            children: [
              { path: '', component: Dummy },
              { path: 'support', component: Dummy },
              { path: 'trainers', component: Dummy },
              { path: 'trainers/:id', component: Dummy },
              { path: 'system', component: Dummy },
              { path: 'analytics', component: Dummy },
              { path: 'database', component: Dummy },
            ],
          },
          { path: 'home', component: Dummy },
        ]),
        { provide: AuthService, useValue: { user$: of(authUser) } },
        { provide: AdminService, useValue: { hasPermission } },
        { provide: AdminSupportService, useValue: { list: listSupport } },
      ],
    });
    const fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();
    return fixture;
  }

  it('derives the admin name and initial from the real Auth0 user', () => {
    const fixture = setup({ authUser: { name: 'ash ketchum' } });
    const inst = fixture.componentInstance as any;
    expect(inst.adminName()).toBe('ash ketchum');
    expect(inst.adminInitial()).toBe('A');
  });

  it('falls back to "Admin" when there is no Auth0 user name', () => {
    const fixture = setup({ authUser: null });
    expect((fixture.componentInstance as any).adminName()).toBe('Admin');
  });

  it('resolves the real open-support count for the sidebar badge', () => {
    const fixture = setup();
    expect((fixture.componentInstance as any).openSupportCount()).toBe(27);
    expect(listSupport).toHaveBeenCalledWith({ status: 'open', page: 1, pageSize: 1 });
  });

  it('resolves the badge count to null (not an error) if the request fails, e.g. a 403', () => {
    listSupport = vi.fn(() => throwError(() => new Error('403')));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user$: of(null) } },
        { provide: AdminService, useValue: { hasPermission: () => true } },
        { provide: AdminSupportService, useValue: { list: listSupport } },
      ],
    });
    const fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).openSupportCount()).toBeNull();
  });

  it('toggleSidebar()/closeSidebar() control the mobile sidebar state', () => {
    const fixture = setup();
    const inst = fixture.componentInstance as any;
    expect(inst.sidebarOpen()).toBe(false);

    inst.toggleSidebar();
    expect(inst.sidebarOpen()).toBe(true);

    inst.closeSidebar();
    expect(inst.sidebarOpen()).toBe(false);
  });

  it('activePath()/currentItem() track real navigation to a child route', async () => {
    const fixture = setup();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/admin/support');
    fixture.detectChanges();

    const inst = fixture.componentInstance as any;
    expect(inst.activePath()).toBe('support');
    expect(inst.currentItem().label).toBe('Support Requests');
  });

  it('the Trainers item is a real, enabled link — not the "Soon" placeholder', () => {
    const fixture = setup();
    const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('a.nav-item');
    const trainersLink = Array.from(links).find((a) => a.textContent?.includes('Trainers'));

    expect(trainersLink).toBeTruthy();
    expect(trainersLink!.getAttribute('href')).toBe('/admin/trainers');
    expect(fixture.nativeElement.textContent).not.toMatch(/Trainers\s*Soon/);
  });

  it('the System Health item is a real, enabled link — not the "Soon" placeholder', () => {
    const fixture = setup();
    const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('a.nav-item');
    const systemLink = Array.from(links).find((a) => a.textContent?.includes('System Health'));

    expect(systemLink).toBeTruthy();
    expect(systemLink!.getAttribute('href')).toBe('/admin/system');
    expect(fixture.nativeElement.textContent).not.toMatch(/System Health\s*Soon/);
  });

  it('the Analytics item is a real, enabled link — not the "Soon" placeholder', () => {
    const fixture = setup();
    const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('a.nav-item');
    const analyticsLink = Array.from(links).find((a) => a.textContent?.includes('Analytics'));

    expect(analyticsLink).toBeTruthy();
    expect(analyticsLink!.getAttribute('href')).toBe('/admin/analytics');
    expect(fixture.nativeElement.textContent).not.toMatch(/Analytics\s*Soon/);
  });

  it('the Database Explorer item is a real, enabled link — not the "Soon" placeholder', () => {
    const fixture = setup();
    const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('a.nav-item');
    const dbLink = Array.from(links).find((a) => a.textContent?.includes('Database Explorer'));

    expect(dbLink).toBeTruthy();
    expect(dbLink!.getAttribute('href')).toBe('/admin/database');
    expect(fixture.nativeElement.textContent).not.toMatch(/Database Explorer\s*Soon/);
  });

  it('a trainer detail sub-route still counts as being on the Trainers item (breadcrumb + active highlight)', async () => {
    const fixture = setup();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/admin/trainers/auth0|abc123');
    fixture.detectChanges();

    const inst = fixture.componentInstance as any;
    expect(inst.currentItem().label).toBe('Trainers');
    expect(inst.isActive('trainers')).toBe(true);
  });

  it('does not render a nav item the trainer lacks the permission for', () => {
    hasPermission = vi.fn((p: string) => p !== 'database:read');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user$: of(null) } },
        { provide: AdminService, useValue: { hasPermission } },
        { provide: AdminSupportService, useValue: { list: () => of({ results: [], page: 1, pageSize: 1, total: 0 }) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('Database Explorer');
  });
});
