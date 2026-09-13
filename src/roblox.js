// Lightweight calls to official Roblox web APIs using an account's own cookie.

const AUTH_URL = 'https://auth.roblox.com';

function cookieHeader(cookie) {
  return `.ROBLOSECURITY=${cookie}`;
}

async function readError(res) {
  try {
    const data = await res.json();
    return data?.errors?.[0]?.message || data?.message || `Roblox API error (HTTP ${res.status})`;
  } catch {
    return `Roblox API error (HTTP ${res.status})`;
  }
}

// Roblox requires a CSRF token for authenticated state-changing requests.
async function getCsrfToken(cookie) {
  const res = await fetch(`${AUTH_URL}/v2/logout`, {
    method: 'POST',
    headers: { Cookie: cookieHeader(cookie) },
  });
  const token = res.headers.get('x-csrf-token');
  if (!token) {
    throw new Error(res.ok ? 'Roblox did not provide a CSRF token.' : await readError(res));
  }
  return token;
}

export async function changePassword({ cookie, currentPassword, newPassword }) {
  if (!cookie) throw new Error('The account does not have a Roblox session cookie.');
  if (!currentPassword) throw new Error('Enter the current password.');
  if (!newPassword) throw new Error('Enter a new password.');

  const csrfToken = await getCsrfToken(cookie);
  const res = await fetch(`${AUTH_URL}/v2/user/passwords/change`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(cookie),
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!res.ok) throw new Error(await readError(res));
  return true;
}

// GET https://voice.roblox.com/v1/settings -> voice chat status for the account.
// Returns { enabled, verified, eligible } or null if the call fails.
export async function checkVoiceChat(cookie) {
  try {
    const res = await fetch('https://voice.roblox.com/v1/settings', {
      headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      enabled: Boolean(data.isVoiceEnabled),
      verified: Boolean(data.isVerifiedForVoice),
      eligible: Boolean(data.isUserEligible),
    };
  } catch {
    return null;
  }
}
