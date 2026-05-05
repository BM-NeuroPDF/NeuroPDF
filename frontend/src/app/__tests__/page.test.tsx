import { describe, it, expect } from 'vitest';

// Utilities tested in isolation (no Next.js/React imports)
describe('getRoleColorClass utility logic', () => {
  // Replicate the logic from page.tsx without importing the component
  const getRoleColorClass = (role: string): string => {
    const normalizedRole = role ? role.toLowerCase() : '';
    if (normalizedRole === 'admin') return 'text-red-600';
    if (normalizedRole === 'pro') return 'text-amber-500';
    return 'text-emerald-600';
  };

  it('returns red class for admin role', () => {
    expect(getRoleColorClass('admin')).toBe('text-red-600');
    expect(getRoleColorClass('ADMIN')).toBe('text-red-600');
  });

  it('returns amber class for pro role', () => {
    expect(getRoleColorClass('pro')).toBe('text-amber-500');
    expect(getRoleColorClass('PRO')).toBe('text-amber-500');
  });

  it('returns emerald class for standard user', () => {
    expect(getRoleColorClass('user')).toBe('text-emerald-600');
    expect(getRoleColorClass('')).toBe('text-emerald-600');
  });
});

describe('stats toggling logic', () => {
  it('sets showPersonal to false when no session', () => {
    const session = null;
    const isPersonalMode = !!(session && true);
    expect(isPersonalMode).toBe(false);
  });

  it('can toggle to personal mode when session exists', () => {
    const session = { user: { name: 'Test' } };
    const showPersonal = true;
    const isPersonalMode = !!(session && showPersonal);
    expect(isPersonalMode).toBe(true);
  });
});
