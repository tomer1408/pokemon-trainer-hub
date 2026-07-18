// Bookmarks to the real external dashboards this app's production
// deployment depends on — not secrets, just outbound links, so a plain
// exported const is enough (no settings/persistence layer needed). These
// point at each service's generic dashboard root; replace with your exact
// org/project URL if you want a deep link straight to this app's resource.
export interface ExternalDashboardLink {
  label: string;
  url: string;
}

export const ADMIN_EXTERNAL_LINKS: ExternalDashboardLink[] = [
  { label: 'Sentry (errors)', url: 'https://sentry.io' },
  { label: 'Render (server)', url: 'https://dashboard.render.com' },
  { label: 'Vercel (client)', url: 'https://vercel.com/dashboard' },
  { label: 'UptimeRobot (uptime)', url: 'https://uptimerobot.com/dashboard' },
];
