import { EmbedBuilder } from 'discord.js';
import { getHealth, getBottingStatus, getBalance } from '../bloxgen.js';
import { COLORS } from '../config.js';

export default {
  name: 'status',
  aliases: ['ping'],
  async execute() {
    // Fetch everything in parallel; failures degrade gracefully to "unknown".
    const [health, botting, balance] = await Promise.allSettled([
      getHealth(),
      getBottingStatus(),
      getBalance(),
    ]);

    const apiOk = health.status === 'fulfilled' && health.value.ok;
    const sgOk = botting.status === 'fulfilled' && botting.value.bottingServer?.available;
    const sgKnown = botting.status === 'fulfilled';
    const bal = balance.status === 'fulfilled' ? `$${balance.value.balance}` : 'unknown';

    const allUp = apiOk && sgOk;
    const embed = new EmbedBuilder()
      .setTitle('📡 BloxGen status')
      .setColor(allUp ? COLORS.success : COLORS.error)
      .addFields(
        { name: 'API', value: apiOk ? '🟢 Online' : '🔴 Offline' },
        {
          name: 'Social Growth',
          value: !sgKnown ? '⚪ Unknown' : sgOk ? '🟢 Online' : '🔴 Offline',
        },
        { name: 'Balance', value: `💰 ${bal}` },
      )
      .setTimestamp();

    return { embeds: [embed] };
  },
};
