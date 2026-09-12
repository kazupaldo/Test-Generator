// Lightweight calls to official Roblox web APIs using an account's own cookie.

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
