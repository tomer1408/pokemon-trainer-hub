const MIN_AGE = 13;

function calculateAge(dateOfBirth, now = new Date()) {
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = now.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}

// Not persisted — always derived fresh from dateOfBirth so it can never go
// stale (a trainer's bucket can change with time even with no new save).
function calculateAgeRange(dateOfBirth, now = new Date()) {
  const age = calculateAge(dateOfBirth, now);
  if (age < 18) return '13-17';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  return '35+';
}

module.exports = { MIN_AGE, calculateAge, calculateAgeRange };
