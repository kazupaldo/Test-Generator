import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getHistory, getAllHistory, findAccountByUsername } from '../bloxgen-dashboard.js';
import { checkVoiceChat } from '../roblox.js';
import { accountActionsRow, buildAccountEmbed, buildAccountFile } from '../lib/ui.js';
import { COLORS, PREFIX } from '../config.js';
import {
  describeDirectMessageError,
  logDirectMessageError,
  sendDirectMessage,
} from '../lib/delivery.js';

const PAGE_SIZE = 10;
const EXPORT_FORMATS = new Set([
  'txt',
  'text',
  'csv',
  'json',
  'user:pass',
  'user:pass:cookie',
  'userpass',
  'userpasscookie',
]);

function fmtDate(iso) {
  if (!iso) return 'N/A';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 'N/A' : `<t:${Math.floor(t / 1000)}:R>`;
}

// Prev / Next buttons for paging through the history (customId "hist:<targetPage>").
function pageButtons(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hist:${page - 1}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`hist:${page + 1}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(totalPages ? page >= totalPages : false),
  );
}

// Build the message payload for one history page (used by the command AND the buttons).
export async function buildHistoryPage(page = 1) {
  const data = await getHistory({ page, limit: PAGE_SIZE });
  const hist = data?.history ?? [];
  const pg = data?.pagination ?? {};
  const curr = pg.page ?? page;
  const total = pg.totalPages ?? 1;

  const embed = new EmbedBuilder().setColor(COLORS.brand).setTitle('🗂️ Generation history');

  if (!hist.length) {
    embed.setDescription('📭 No accounts on this page.');
    return { embeds: [embed], components: [] };
  }

  embed
    .setDescription(
      hist
        .map((a, i) => {
          const n = (curr - 1) * PAGE_SIZE + i + 1;
          const region = a.region ? ` · ${a.region}` : '';
          return `**${n}.** \`${a.username}\` — ${a.type}${region} · ${fmtDate(a.generatedAt)}`;
        })
        .join('\n'),
    )
    .setFooter({
      text: `Page ${curr}/${total} · ${pg.total ?? hist.length} total · ${PREFIX}history <username> for login · ${PREFIX}history export for a file`,
    });

  return { embeds: [embed], components: [pageButtons(curr, total)] };
}

// DM the same embed as a generation (username/password/cookie/voice) for one account.
async function sendAccountDM(user, username) {
  const acc = await findAccountByUsername(username);
  if (!acc) return `❌ No generated account found with username \`${username}\`.`;
  const voice = await checkVoiceChat(acc.cookie).catch(() => null);
  try {
    const file = buildAccountFile(acc);
    await sendDirectMessage(user, {
      embeds: [buildAccountEmbed(acc, voice)],
      components: [accountActionsRow(acc.type, acc.username, user.id)],
      ...(file ? { files: [file] } : {}),
    });
    return '📩 Account sent to your DMs.';
  } catch (err) {
    logDirectMessageError('history account lookup', user, err);
    return `❌ ${describeDirectMessageError(err)}`;
  }
}

function parseExportArgs(args) {
  const tokens = args.slice(1);
  const typeParts = [];
  let type = null;
  let page = null;
  let format = 'userpasscookie';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    if (lower.startsWith('--type=')) {
      type = token.slice(token.indexOf('=') + 1);
    } else if (lower === '--type') {
      type = tokens[++i] || 'all';
    } else if (lower.startsWith('--page=')) {
      page = Math.max(1, parseInt(token.slice(token.indexOf('=') + 1), 10) || 1);
    } else if (lower === '--page') {
      page = Math.max(1, parseInt(tokens[++i], 10) || 1);
    } else if (lower.startsWith('--format=')) {
      format = token.slice(token.indexOf('=') + 1).toLowerCase();
    } else if (lower === '--format') {
      format = (tokens[++i] || 'txt').toLowerCase();
    } else if (/^\d+$/.test(token)) {
      page = Math.max(1, parseInt(token, 10));
    } else if (EXPORT_FORMATS.has(lower)) {
      format = lower;
    } else {
      typeParts.push(token);
    }
  }

  if (!type && typeParts.length) type = typeParts.join(' ');
  type = type?.trim() || 'all';
  if (type.toLowerCase() === 'all') type = null;
  if (!EXPORT_FORMATS.has(format)) format = 'userpasscookie';
  if (format === 'text') format = 'txt';
  if (format === 'user:pass' || format === 'userpass') format = 'userpass';
  if (format === 'user:pass:cookie' || format === 'userpasscookie') format = 'userpasscookie';
  return { type, page, format };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function exportText(accounts) {
  return accounts.map((account) => [
    `type: ${account.type || ''}`,
    `username: ${account.username || ''}`,
    `password: ${account.password || ''}`,
    `cookie: ${account.cookie || ''}`,
  ].join('\n')).join('\n\n');
}

function exportCsv(accounts) {
  const columns = ['type', 'username', 'password', 'cookie', 'region', 'generatedAt', 'id'];
  return [
    columns.join(','),
    ...accounts.map((account) => columns.map((column) => csvCell(account[column])).join(',')),
  ].join('\n');
}

function exportJson(accounts) {
  return JSON.stringify(accounts, null, 2);
}

function exportUserPass(accounts) {
  return accounts.map((account) => `${account.username}:${account.password}`).join('\n');
}

function exportUserPassCookie(accounts) {
  return accounts
    .filter((account) => account.cookie)
    .map((account) => `${account.username}:${account.password}:${account.cookie}`)
    .join('\n');
}

async function exportHistory(message, args) {
  const { type, page, format } = parseExportArgs(args);
  const data = page ? await getHistory({ page, limit: 100 }) : { history: await getAllHistory() };
  const accounts = (data?.history ?? []).filter((account) =>
    account.username && account.password &&
    (format !== 'userpasscookie' || account.cookie) &&
    (!type || String(account.type).toLowerCase() === type.toLowerCase()),
  );
  if (!accounts.length) {
    return `📭 No accounts found${type ? ` for \`${type}\`` : ''}${page ? ` on page ${page}` : ''}.`;
  }

  const content = format === 'csv'
    ? exportCsv(accounts)
    : format === 'json'
      ? exportJson(accounts)
      : format === 'userpass'
        ? exportUserPass(accounts)
        : format === 'userpasscookie'
          ? exportUserPassCookie(accounts)
          : exportText(accounts);
  const extension = format === 'userpass' || format === 'userpasscookie' ? 'txt' : format;
  const formatLabel = format === 'userpass'
    ? 'user:pass'
    : format === 'userpasscookie'
      ? 'user:pass:cookie'
      : format.toUpperCase();
  const suffix = type ? `-${type.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}` : '';
  const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
    name: `bloxgen-history-${format.replace(/:/g, '-')}${suffix}${page ? `-page-${page}` : ''}.${extension}`,
  });
  try {
    await sendDirectMessage(message.author, {
      content: `📦 **${accounts.length}** account${accounts.length === 1 ? '' : 's'} exported as **${formatLabel}**. Keep this file private.`,
      files: [file],
    });
    return '📩 Export sent to your DMs.';
  } catch (err) {
    logDirectMessageError('history export', message.author, err);
    return `❌ ${describeDirectMessageError(err)}`;
  }
}

export default {
  name: 'history',
  aliases: ['hist'],
  async execute({ message, args }) {
    const sub = args[0] || '';
    const subL = sub.toLowerCase();

    // +history export [type] [page] [format]
    if (subL === 'dump' || subL === 'export') {
      return exportHistory(message, subL === 'dump' ? ['export', ...args.slice(1)] : args);
    }

    // +history <username>  ->  DM that account's full login (same embed as a generation).
    if (sub && !/^\d+$/.test(sub)) {
      return sendAccountDM(message.author, sub);
    }

    // +history [page]  ->  safe listing with Prev/Next buttons.
    const page = Math.max(1, parseInt(sub, 10) || 1);
    return buildHistoryPage(page);
  },
};
