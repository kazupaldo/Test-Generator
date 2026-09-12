import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { ACCOUNT_TYPES } from './bloxgen.js';
import { commandList } from './commands/index.js';

const descriptions = {
  generate: 'Generate a Roblox account',
  panel: 'Open the account type picker',
  balance: 'Show the BloxGen balance',
  followers: 'Check follower availability for a Roblox account',
  stock: 'Show available account stock',
  prices: 'Show account prices',
  limits: 'Show daily generation limits',
  status: 'Show BloxGen and Social Growth status',
  settings: 'Choose DM or channel delivery for generated accounts',
  logs: 'Configure the generation log channel',
  history: 'View or export your generated account history',
  help: 'Show the command guide',
  autogen: 'Open the 24-hour auto-generation panel',
};

function base(name) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(descriptions[name])
    .setDMPermission(false);
}

function buildCommand(name) {
  const command = base(name);

  switch (name) {
    case 'generate':
      command.addStringOption((option) => {
        option
          .setName('type')
          .setDescription('Account category')
          .setRequired(false)
          .addChoices(...ACCOUNT_TYPES.map((type) => ({ name: type, value: type })));
        return option;
      });
      break;
    case 'followers':
      command.addStringOption((option) =>
        option.setName('account').setDescription('Roblox username or user ID').setRequired(true),
      );
      break;
    case 'settings':
      command.addStringOption((option) => {
        option
          .setName('mode')
          .setDescription('Where generated accounts should be delivered')
          .setRequired(false)
          .addChoices(
            { name: 'DM (private)', value: 'dm' },
            { name: 'Channel', value: 'server' },
            { name: 'DM + channel', value: 'both' },
          );
        return option;
      });
      command.addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Channel for channel or DM + channel delivery')
          .setRequired(false),
      );
      break;
    case 'logs':
      command
        .addStringOption((option) => {
          option
            .setName('action')
            .setDescription('Enable logging here or disable it')
            .setRequired(false)
            .addChoices(
              { name: 'This channel', value: 'here' },
              { name: 'Disable logging', value: 'off' },
              { name: 'Specific channel', value: 'channel' },
            );
          return option;
        })
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where generations should be logged')
            .setRequired(false),
        );
      break;
    case 'history':
      command
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('View history or export an account file')
            .setRequired(false)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Export', value: 'export' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Account type to export (default: all)')
            .setRequired(false)
            .addChoices(
              { name: 'All types', value: 'all' },
              ...ACCOUNT_TYPES.map((type) => ({ name: type, value: type })),
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName('page')
            .setDescription('Only export this history page')
            .setMinValue(1)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('format')
            .setDescription('Export file format')
            .setRequired(false)
            .addChoices(
              { name: 'user:pass', value: 'userpass' },
              { name: 'user:pass:cookie', value: 'userpasscookie' },
              { name: 'TXT', value: 'txt' },
              { name: 'CSV', value: 'csv' },
              { name: 'JSON', value: 'json' },
            ),
        );
      break;
    case 'autogen':
    case 'panel':
    case 'balance':
    case 'stock':
    case 'prices':
    case 'limits':
    case 'status':
    case 'help':
      break;
    default:
      throw new Error(`No slash command definition for ${name}`);
  }

  if (['settings', 'logs', 'autogen'].includes(name)) {
    command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
  }
  return command;
}

// Only primary command names are registered. Prefix aliases remain available
// for backwards compatibility, while slash commands stay easy to discover.
export const slashCommands = commandList.map((command) => buildCommand(command.name));

export async function registerSlashCommands(client, guild) {
  await guild.commands.set(slashCommands.map((command) => command.toJSON()));
  console.log(`Registered ${slashCommands.length} slash commands in ${guild.name}.`);
}