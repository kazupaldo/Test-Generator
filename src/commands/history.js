import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getHistory, getAllHistory, findAccountByUsername } from '../bloxgen-dashboard.js';
import { checkVoiceChat } from '../roblox.js';
import { buildAccountEmbed } from '../lib/ui.js';
import { COLORS, PREFIX } from '../config.js';
import {
  describeDirectMessageError,
  logDirectMessageError,
  sendDirectMessage,
} from '../lib/delivery.js';

const PAGE_SIZE = 10;

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
      text: `Page ${curr}/${total} · ${pg.total ?? hist.length} total · ${PREFIX}history <username> to get its login · ${PREFIX}history dump to export all`,
    });

  return { embeds: [embed], components: [pageButtons(curr, total)] };
}

// DM the same embed as a generation (username/password/cookie/voice) for one account.
async function sendAccountDM(user, username) {
  const acc = await findAccountByUsername(username);
  if (!acc) return `❌ No generated account found with username \`${username}\`.`;
  const voice = await checkVoiceChat(acc.cookie).catch(() => null);
  try {
    await sendDirectMessage(user, { embeds: [buildAccountEmbed(acc, voice)] });
    return '📩 Account sent to your DMs.';
  } catch (err) {
    logDirectMessageError('history account lookup', user, err);
    return `❌ ${describeDirectMessageError(err)}`;
  }
}

export default {
  name: 'history',
  aliases: ['hist'],
  async execute({ message, args }) {
    const sub = args[0] || '';
    const subL = sub.toLowerCase();

    // +history dump  ->  DM a `username:password:cookie` .txt of every account.
    if (subL === 'dump' || subL === 'export') {
      const all = await getAllHistory();
      const lines = all
        .filter((a) => a.username && a.password && a.cookie)
        .map((a) => `${a.username}:${a.password}:${a.cookie}`);
      if (!lines.length) return '📭 No accounts in your history.';

      const file = new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), {
        name: 'bloxgen-accounts.txt',
      });
      try {
        await sendDirectMessage(message.author, {
          content: `📦 **${lines.length}** accounts (\`username:password:cookie\`). Keep this file private.`,
          files: [file],
        });
        return '📩 Export sent to your DMs.';
      } catch (err) {
        logDirectMessageError('history export', message.author, err);
        return `❌ ${describeDirectMessageError(err)}`;
      }
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
