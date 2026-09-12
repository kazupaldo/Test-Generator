// Centralized delivery helpers so every generation path handles Discord DMs
// consistently and preserves the original Discord error code.

export async function sendDirectMessage(user, payload) {
  // Explicitly create/fetch the DM channel before sending. This gives Discord
  // one clear API path and works for both cached and freshly fetched users.
  const channel = await user.createDM();
  await channel.send(payload);
}

export function describeDirectMessageError(error) {
  const code = error?.code;
  if (code === 50007) {
    return 'Discord blocked the DM. Enable **Allow direct messages from server members** in this server’s Privacy Settings, then try again.';
  }
  if (code === 50013) {
    return 'Discord denied the DM request. Check that the bot is not blocked and try again.';
  }
  return 'Discord could not open your DM. Check your privacy settings and try again.';
}

export function logDirectMessageError(context, user, error) {
  console.error(
    `DM delivery failed (${context}) for user ${user?.id ?? 'unknown'}:`,
    `code=${error?.code ?? 'unknown'}`,
    error?.message ?? 'unknown error',
  );
}