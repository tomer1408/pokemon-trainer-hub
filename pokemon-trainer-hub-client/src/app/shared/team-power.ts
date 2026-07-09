// Team Power is shown on multiple screens (Dashboard, My Team, AI Trainer
// Assistant) and must use one shared calculation rather than each screen
// computing its own. Per the PRD: sum of base_experience across the team.
export function getTeamPower(members: { baseExperience: number }[]): number {
  return members.reduce((sum, m) => sum + (m.baseExperience || 0), 0);
}

export function getStrongestMember<T extends { baseExperience: number }>(members: T[]): T | null {
  if (members.length === 0) return null;
  return members.reduce((a, b) => (b.baseExperience > a.baseExperience ? b : a));
}

// Trainer tier shown next to the team on Dashboard and My Team — based on how
// many Pokémon have been caught (0 / 1-2 / 3-4 / 5), per the original design
// (Dashboard.dc.html's tierFor()), not on Team Power.
export function getTeamTier(teamSize: number): string {
  if (teamSize === 0) return 'Rookie';
  if (teamSize <= 2) return 'Beginner';
  if (teamSize <= 4) return 'Trainer';
  return 'Master';
}
