# 🤖 BloxGen Discord Bot

A simple Discord bot that lets you generate Roblox accounts through the [BloxGen API](https://docs.bloxgen.net), right from your Discord server.

You can use prefix commands like `+generate alt` or native Discord slash commands like `/generate`.

> **Companion tools** (Chrome extensions for the Bloxgen dashboard):
> [Bloxgen Voice Checker](https://github.com/joe-jns/bloxgen-voice-checker) — check if voice chat is enabled (+ age group) ·
> [Bloxgen Account Claimer](https://github.com/joe-jns/bloxgen-account-claimer) — claim accounts by changing their password.

---

## ✨ What it can do

| Command | What it does |
| --- | --- |
| `+generate [type]` | Generates a Roblox account (no type = dropdown menu) |
| `+panel` | Opens a dropdown menu to pick an account type |
| `+balance` | Shows how much money is left on the BloxGen account |
| `+history [page]` | Lists your generated accounts (Prev/Next buttons to page) |
| `+history <username>` | DMs that account's full login (same embed as a generation) |
| `+history export [type] [page] [format]` | DMs filtered history as `txt`, `csv`, or `json` |
| `+secure <username>` | Opens a private password security action for a generated account |
| `+secure type <type>` | DMs up to five recent accounts of one type with manual security actions |
| `+followers <id>` | Checks how many followers can be added to a Roblox account |
| `+stock` | Live-checks which account types are currently in stock |
| `+prices` | Shows the price of each account type |
| `+limits` | Shows your daily generation limits |
| `+status` | Shows API & Social Growth health and your balance |
| `+settings` | Choose DMs, a channel, or both destinations (admins only) |
| `+settings channels` | Show every type-to-channel mapping |
| `+settings create-channels` | Create and route the standard generated-account channels |
| `+settings clear-type <type>` | Remove one dedicated type channel |
| `+logs` | Set/clear the channel where generations are logged (admins only) |
| `+autogen` | Open the admin-only continuous auto-generation panel |
| `+autogen interval <seconds>` | Set the auto-generation interval while disabled |
| `+autogen priority <type,type,...>` | Set the rotation priority while disabled |
| `+key` | Add, inspect, switch, or remove personal encrypted API keys |
| `+help` | Shows the list of commands |

**Account types** for `+generate`: `alt`, `+30 days old`, `+1 year old`, `5+ years old`, `dump`, `18+ age verified`.

### Slash commands

The primary commands are also registered as native Discord slash commands:
`/generate`, `/panel`, `/balance`, `/followers`, `/stock`, `/prices`,
`/limits`, `/status`, `/settings`, `/logs`, `/history`, `/secure`, `/help`, and `/autogen`.
They are registered for each server when the bot starts or joins it. Prefix
commands remain available for compatibility.

`+stock` and `/stock` call the BloxGen stock endpoint when used. The response
also includes a **Refresh live stock** button. Every generation performs a
fresh stock and daily-limit check before the paid API request.

> 💡 By default, generated accounts are sent to you **privately**. Channel messages keep the password and cookie hidden; **Show login** sends them to the account recipient's DMs. An admin can use `+settings both #channel` or `/settings mode:both channel:#channel` to deliver every account to both destinations.

### 🔐 Personal API keys and credential safety

The bot does not need the host's BloxGen API key. Each person who generates an
account should open `+key` (or `/key`) and add their own key privately. Keys are
encrypted at rest with `SESSION_SECRET`, never printed in logs, and multiple named
keys can be saved. Use `+key use <name>` to switch the active key.

Every delivery has a durable duplicate ledger and retry queue. A temporary
Discord failure does not trigger another paid generation, and queued account
details are encrypted when `SESSION_SECRET` is configured. Set
`CREDENTIAL_DELETE_AFTER_MS` to automatically remove credential messages after a
chosen number of milliseconds.

### 🎙️ Voice chat status

When an account is generated, the bot uses the account's own cookie to query the official Roblox voice settings API and shows whether **voice chat** is enabled/verified for it. If the lookup fails, the field is simply omitted.

### 🔐 Change an account password

Generated account messages include a **Change password** button. Click it, enter
the current password and the new password twice, and the bot changes the
password through Roblox's authenticated account API. The updated login is sent
to your DMs; the new password is never written to the bot logs or posted in a
server channel.

If you no longer have the original account message, use `+secure <username>` or
`/secure account:<username>` to open the same private action. To filter recent
accounts by type, use `+secure type <type>` or `/secure type:<type>`. Each
password change is still explicit and the current password is required.

### 🖱️ Dropdown menu

Type `+panel` (or just `+generate` with no type) and the bot shows a **dropdown menu** to pick an account type. Picking one generates the account and sends it to your **DMs** — with **🔄 Generate again** and **🔐 Change password** buttons. No need to remember the command syntax.

### 📋 Logging (optional)

Log every generation (who generated it, the type, and the cost) to a channel — handy when several people share your balance. An admin sets it up right in Discord:

- `+logs here` — log to the current channel
- `+logs #channel` — log to a specific channel
- `+logs` — show the current log channel
- `+logs off` — disable logging

You can also set a default `LOG_CHANNEL_ID` in `.env`, but the `+logs` command takes priority.

### ⏱️ Continuous auto-generation

Server admins can type `+autogen` to open the control panel. Select one or more
account categories, then press **Enable** to generate one account immediately
and continue at the configured interval until an admin presses **Disable**. Smart generation refreshes
BloxGen stock and daily limits before every attempt, skips an unavailable or
limited type, and rotates through the types that are both stocked and eligible.
If all selected stock is gone, generation keeps checking without entering a
paused state and continues automatically when an eligible type returns. The panel
shows per-type status, per-type counters, queue depth, daily generated/success/
failed totals, and the most recent checks. It also alerts the control channel when
all selected types are unavailable or limited.
The `dump` category is included and its extra metadata (Robux, RAP, summary,
and verification details when provided) is shown in the result.

BloxGen can enforce cooldowns and separate daily limits by account type. The
bot normalizes the API's limit response and uses the same normalized values in
`+limits`, manual generation, and auto-generation. When the API reports a
cooldown, the bot waits for it instead of repeatedly submitting requests.

Press **Disable** at any time to stop it immediately. Auto-generated accounts
follow the server's current DM, channel, or DM + channel delivery setting.
Channel delivery should still be restricted to a private channel, even though
credentials are now masked by default.

---

## 🚀 Setup guide (no coding needed)

Follow these steps once. It takes about 10 minutes.

### Step 1 — Install Node.js

The bot needs a free program called **Node.js** to run.

1. Go to **https://nodejs.org**
2. Download the **LTS** version (the big green button) and install it (just click Next → Next → Finish).

### Step 2 — Download the bot

1. On this GitHub page, click the green **`Code`** button → **Download ZIP**.
2. Unzip it somewhere easy to find, like your Desktop.

### Step 3 — Create your Discord bot

1. Go to **https://discord.com/developers/applications** and log in.
2. Click **New Application**, give it a name, click **Create**.
3. In the left menu, click **Bot**.
4. Click **Reset Token**, then **Copy** — keep this token safe, you'll need it. ⚠️ Never share it.
5. Scroll down to **Privileged Gateway Intents** and turn ON **MESSAGE CONTENT INTENT**. Click **Save**.

### Step 4 — Invite the bot to your server

1. In the left menu, click **OAuth2**.
2. Under **OAuth2 URL Generator**, scroll down, check **`bot`**.
3. In the **Bot Permissions** box that appears, check: **Send Messages**, **Embed Links**, **Read Message History**.
4. Copy the link at the bottom, paste it in your browser, and pick your server to invite the bot.

### Step 5 — Add the bot token and encryption secret

1. In the bot folder, find the file named **`.env.example`**.
2. Make a copy of it and rename the copy to **`.env`** (just `.env`, nothing before the dot).
3. Open `.env` with Notepad and fill in:
   ```
   DISCORD_TOKEN=paste-the-token-for-your-new-test-bot-here
    SESSION_SECRET=use-a-long-random-secret-here
   ```
   If this is a different test bot, create or reset that bot's token and
   invite that same application to the test server. Do not reuse a token from
   another bot or paste a token into Discord messages.
4. *(Optional — only for `+history`)* The official API has no history endpoint, so
   `+history` uses your dashboard session cookie. On <https://bloxgen.net> (logged in),
   press **F12 → Application → Cookies → https://bloxgen.net**, copy the value of the
   **`accessToken`** cookie, and add it:
   ```
   BLOXGEN_SESSION_COOKIE=paste-the-accessToken-value
   ```
   This cookie lasts about 7 days, so you'll re-paste it now and then.
4. Save the file. `BLOXGEN_API_KEY` is optional; users add their own keys
   through `+key` or `/key`.

### Step 6 — Start the bot

1. Open the bot folder.
2. Click the address bar at the top of the window, type `cmd`, and press **Enter** (this opens a black command window in that folder).
3. Type this and press Enter (only needed the first time):
   ```
   npm install
   ```
4. Then start the bot:
   ```
   npm start
   ```

When you see **`Logged in as ...`**, the bot is online! 🎉
Go to your Discord server and try `+help`.

> To keep the bot running, leave that command window open. Closing it stops the bot.

---

## ⚙️ Settings: DM vs channel

By default accounts are sent privately to whoever ran the command.

A server admin (someone with **Manage Server** permission) can change this:

- `+settings dm` → accounts sent privately by DM (default, safest)
- `+settings server #channel` → accounts posted in the selected channel
- `+settings both #channel` → accounts sent to the initiating user's DM **and** posted in the selected channel
- `+settings type <account type> #channel` → route one account type to its own channel
- `+settings channels` → show all current mappings
- `+settings create-channels` → create `#generated-alt`, `#generated-dump`, `#generated-1-year`, and `#generated-5-years`
- `+settings clear-type <account type>` → return one type to the default channel
- `+settings` → shows the current setting

The slash equivalent is `/settings mode:both channel:#channel`. In `both`
mode, auto-generation sends every account to the configured channel and to
the admin who enabled the run.
Use `/settings type:<account type> type_channel:#channel` to route a specific
account type to its own channel. Per-type channels override the default channel
for that type; DM delivery is unchanged.

⚠️ **Warning:** `server` and `both` modes expose the username and account metadata
to everyone who can read the selected channel. Passwords and cookies remain
masked there, but use a private/admin-only channel for account operations.

---

## 📦 History exports

Prefix examples:

- `+history export` → export all accounts as a text file
- `+history export +30 days old 2 csv` → export one type from page 2 as CSV
- `+history export --type=dump --format=json` → export one type as JSON

`/history action:Export` exposes separate type, page, and format options. The
export uses the dashboard session cookie, so keep the resulting file private.

---

## ❓ Troubleshooting

| Problem | Fix |
| --- | --- |
| Bot doesn't respond to commands | Make sure **MESSAGE CONTENT INTENT** is ON (Step 3.5) and the bot is online. |
| "Could not DM you" | Allow DMs from server members (Server settings → Privacy), or use `+settings server`. The bot checks the destination before it requests a paid account. |
| Account generated but not posted | Give the bot **Send Messages**, **Embed Links**, and **Attach Files** in the selected channel. Long cookies are sent as a private account file instead of an oversized embed field. |
| "API key is required" / "Invalid API key" | Open `+key` or `/key`, add your personal BloxGen key, and verify it in the key panel. |
| "You must accept the rules before generating" | Accept the rules once in the BloxGen dashboard. |
| "Insufficient balance" | Top up your BloxGen balance. |
| `'npm' is not recognized` | Node.js isn't installed — redo Step 1, then reopen the command window. |

---

## 🔒 Notes

- The BloxGen API key belongs to **you (the bot owner)** — everyone using the bot spends from **your** balance.
- Never share your `.env` file, your Discord token, or your API key.
- Keep the bot in a server/channel you trust.
- Store `DISCORD_TOKEN`, `SESSION_SECRET`, optional `BLOXGEN_API_KEY`, and `BLOXGEN_SESSION_COOKIE` only in
  `.env` or your host's secret manager.

---

## 🛠️ For developers

Node.js 18+ (uses built-in `fetch`), [discord.js](https://discord.js.org) v14.

```
src/
├── index.js              entry point (client, login, error handlers)
├── config.js             loads .env (cwd-independent) + constants
├── bloxgen.js            BloxGen API client
├── lib/
│   ├── settings.js       per-server settings store (settings.json)
│   ├── ui.js             embeds & components (panel, buttons)
│   ├── logger.js         logs generations to a channel
│   └── generation.js     shared generate → embed → log logic
├── commands/             one file per command (+ index.js registry)
└── events/               messageCreate & interactionCreate handlers
```

**Adding a prefix command:** drop a file in `src/commands/` exporting
`{ name, aliases?, execute({ message, args, client }) }` and register it in
`src/commands/index.js`.

```bash
npm install
npm start
```
