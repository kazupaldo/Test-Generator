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
| `+history dump` | DMs **all** accounts as a `user:pass:cookie` .txt file |
| `+followers <id>` | Checks how many followers can be added to a Roblox account |
| `+stock` | Live-checks which account types are currently in stock |
| `+prices` | Shows the price of each account type |
| `+limits` | Shows your daily generation limits |
| `+status` | Shows API & Social Growth health and your balance |
| `+key` | Securely manage your personal BloxGen API key |
| `+settings` | Choose DMs, a channel, or both destinations (admins only) |
| `+logs` | Set/clear the channel where generations are logged (admins only) |
| `+autogen` | Open the admin-only 24-hour auto-generation panel |
| `+help` | Shows the list of commands |

**Account types** for `+generate`: `alt`, `+30 days old`, `+1 year old`, `5+ years old`, `dump`.

### Slash commands

The primary commands are also registered as native Discord slash commands:
`/generate`, `/panel`, `/balance`, `/followers`, `/stock`, `/prices`,
`/limits`, `/status`, `/settings`, `/logs`, `/history`, `/help`, `/autogen`,
and `/key`.
They are registered for each server when the bot starts or joins it. Prefix
commands remain available for compatibility.

`+stock` and `/stock` call the BloxGen stock endpoint when used. The response
also includes a **Refresh live stock** button. Auto-generation performs another
stock check before every generation attempt.

### Personal API keys

Users can run `/key` to open a private key manager. The bot validates the key
with BloxGen, encrypts it at rest using `SESSION_SECRET`, and uses that key for
the user's balance, stock, pricing, limits, follower, and generation commands.
Keys are never displayed or written to logs. The bot owner key remains the
fallback for users who have not added a personal key.

> 💡 By default, generated accounts are sent to you **privately** so nobody else sees the passwords. An admin can use `+settings both #channel` or `/settings mode:both channel:#channel` to deliver every account to both destinations.

### 🎙️ Voice chat status

When an account is generated, the bot uses the account's own cookie to query the official Roblox voice settings API and shows whether **voice chat** is enabled/verified for it. If the lookup fails, the field is simply omitted.

### 🖱️ Dropdown menu

Type `+panel` (or just `+generate` with no type) and the bot shows a **dropdown menu** to pick an account type. Picking one generates the account and sends it to your **DMs** — with a **🔄 Generate again** button. No need to remember the command syntax.

### 📋 Logging (optional)

Log every generation (who generated it, the type, and the cost) to a channel — handy when several people share your balance. An admin sets it up right in Discord:

- `+logs here` — log to the current channel
- `+logs #channel` — log to a specific channel
- `+logs` — show the current log channel
- `+logs off` — disable logging

You can also set a default `LOG_CHANNEL_ID` in `.env`, but the `+logs` command takes priority.

### ⏱️ 24-hour auto-generation

Server admins can type `+autogen` to open the control panel. Select one or more
account categories, then press **Enable** to generate one account immediately
and continue every 5 seconds for up to 24 hours. The bot checks BloxGen stock
before each attempt, skips unavailable categories, rotates through the
categories that are in stock, and stops automatically after 24 hours. The
`dump` category is included and its extra metadata (Robux, RAP, summary, and
verification details when provided) is shown in the result.

BloxGen can enforce cooldowns and separate daily limits by account type. When
the API reports a cooldown, the bot waits for it instead of repeatedly
submitting requests.

Press **Disable** at any time to stop it immediately. Auto-generated accounts
follow the server's current DM, channel, or DM + channel delivery setting.
Channel delivery can expose account credentials, so only use it in a private
channel.

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

### Step 5 — Get your BloxGen API key

1. Log in to your **[BloxGen Dashboard](https://bloxgen.net/dashboard/overview)**.
2. Copy your **API key** (it looks like `BLOX-xxxxxxxxxxxxxxxx`).
3. ⚠️ Important: in the dashboard, **accept the rules once** — otherwise `+generate` won't work.

### Step 6 — Add your tokens to the bot

1. In the bot folder, find the file named **`.env.example`**.
2. Make a copy of it and rename the copy to **`.env`** (just `.env`, nothing before the dot).
3. Open `.env` with Notepad and fill in:
   ```
   DISCORD_TOKEN=paste-your-discord-token-here
   BLOXGEN_API_KEY=BLOX-your-key-here
    SESSION_SECRET=use-a-long-random-secret-here
   ```
   `SESSION_SECRET` encrypts personal user API keys. Do not change or lose it
   after users have saved keys, or those keys cannot be decrypted.
4. *(Optional — only for `+history`)* The official API has no history endpoint, so
   `+history` uses your dashboard session cookie. On <https://bloxgen.net> (logged in),
   press **F12 → Application → Cookies → https://bloxgen.net**, copy the value of the
   **`accessToken`** cookie, and add it:
   ```
   BLOXGEN_SESSION_COOKIE=paste-the-accessToken-value
   ```
   This cookie lasts about 7 days, so you'll re-paste it now and then.
5. Save the file.

### Step 7 — Start the bot

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
- `+settings` → shows the current setting

The slash equivalent is `/settings mode:both channel:#channel`. In `both`
mode, auto-generation sends every account to the configured channel and to
the admin who enabled the run.

⚠️ **Warning:** `server` and `both` modes mean everyone who can read the
selected channel will see the account password and cookie. Only use them in a
private/admin-only channel.

---

## ❓ Troubleshooting

| Problem | Fix |
| --- | --- |
| Bot doesn't respond to commands | Make sure **MESSAGE CONTENT INTENT** is ON (Step 3.5) and the bot is online. |
| "Could not DM you" | Allow DMs from server members (Server settings → Privacy), or use `+settings server`. |
| "API key is required" / "Invalid API key" | Double-check `BLOXGEN_API_KEY` in your `.env`. |
| "You must accept the rules before generating" | Accept the rules once in the BloxGen dashboard. |
| "Insufficient balance" | Top up your BloxGen balance. |
| `'npm' is not recognized` | Node.js isn't installed — redo Step 1, then reopen the command window. |

---

## 🔒 Notes

- The BloxGen API key belongs to **you (the bot owner)** — everyone using the bot spends from **your** balance.
- Never share your `.env` file, your Discord token, or your API key.
- Keep the bot in a server/channel you trust.

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
