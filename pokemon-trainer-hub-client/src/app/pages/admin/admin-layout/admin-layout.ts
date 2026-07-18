import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, filter, map, of } from 'rxjs';
import { AdminService } from '../../../core/admin';
import { AdminSupportService } from '../../../core/admin-support';
import { ThemeService } from '../../../shared/theme';

interface AdminNavItem {
  path: string;
  label: string;
  permission: string;
  // Not every area is built yet (Phases 2-6 add the rest) — shown in the
  // sidebar per the design mockup either way, but not yet clickable.
  built: boolean;
}

const NAV_ITEMS: AdminNavItem[] = [
  { path: '', label: 'Overview', permission: 'admin:read', built: true },
  { path: 'support', label: 'Support Requests', permission: 'support:manage', built: true },
  { path: 'trainers', label: 'Trainers', permission: 'users:manage', built: true },
  { path: 'analytics', label: 'Analytics', permission: 'admin:read', built: false },
  { path: 'system', label: 'System Health', permission: 'admin:read', built: false },
  { path: 'database', label: 'Database Explorer', permission: 'database:read', built: false },
];

// Purely a visual shell (sidebar + header) — carries NO permission of its
// own (see app.routes.ts: this route's canActivate is [authGuardFn] only).
// Each child route independently declares and enforces its own permission
// via adminGuard + route.data.permission, so a future limited-scope Admin
// role is never incorrectly blocked by a guard on this parent.
@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly admin = inject(AdminService);
  private readonly adminSupportService = inject(AdminSupportService);

  protected readonly navItems = NAV_ITEMS;
  protected readonly sidebarOpen = signal(false);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly activePath = computed(() => {
    const url = this.currentUrl().replace(/^\/admin\/?/, '').split(/[?#]/)[0];
    return url;
  });

  // A sub-route like trainers/auth0|abc123 (a trainer's detail page) still
  // counts as being "on" the Trainers item — both for the sidebar's active
  // highlight and the header's breadcrumb/title.
  private isOnItem(item: AdminNavItem): boolean {
    const path = this.activePath();
    return item.path === '' ? path === '' : path === item.path || path.startsWith(`${item.path}/`);
  }

  protected isActive(itemPath: string): boolean {
    const item = this.navItems.find((i) => i.path === itemPath);
    return !!item && this.isOnItem(item);
  }

  protected readonly currentItem = computed(
    () => this.navItems.find((i) => this.isOnItem(i)) ?? this.navItems[0],
  );

  private readonly authUser = toSignal(this.auth.user$, { initialValue: null });
  protected readonly adminName = computed(() => this.authUser()?.name ?? 'Admin');
  protected readonly adminInitial = computed(() => this.adminName().charAt(0).toUpperCase() || 'A');

  // Real open-request count for the Support Requests sidebar badge. If the
  // current trainer lacks support:manage, the server 403s and this quietly
  // resolves to null (badge just doesn't render) rather than surfacing an
  // error for a sidebar decoration.
  protected readonly openSupportCount = toSignal(
    this.adminSupportService
      .list({ status: 'open', page: 1, pageSize: 1 })
      .pipe(
        map((r) => r.total),
        catchError(() => of(null)),
      ),
    { initialValue: null as number | null },
  );

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  hrefFor(item: AdminNavItem): string {
    return item.path ? `/admin/${item.path}` : '/admin';
  }
}
