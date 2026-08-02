const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require("discord.js");

const CUSTOM_ID_PREFIX = "level-settings:";

function formatList(values, formatter) {
  if (values.length === 0) return "None";

  const visible = values.slice(0, 10).map(formatter).join(", ");
  return values.length > 10 ? `${visible}, and ${values.length - 10} more` : visible;
}

function formatSettings(settings) {
  const ignoredChannels = formatList(settings.ignored_channel_ids, (id) => `<#${id}>`);
  const ignoredRoles = formatList(settings.ignored_role_ids, (id) => `<@&${id}>`);
  const rewards = formatList(
    Object.entries(settings.reward_role_ids)
      .sort(([left], [right]) => Number(left) - Number(right)),
    ([level, roleId]) => `Level ${level}: <@&${roleId}>`,
  );

  return [
    "### Leveling Settings",
    `**Leveling:** ${settings.enabled ? "✅ Enabled" : "⚠️ Disabled"}`,
    "-# Controls whether members can earn message XP.",
    `**XP per message:** \`${settings.xp_min}–${settings.xp_max}\``,
    "-# Random XP awarded after the cooldown.",
    `**Cooldown:** \`${settings.cooldown_seconds} seconds\``,
    "-# Prevents every message from granting XP.",
    `**Announcement channel:** ${settings.announcement_channel_id ? `<#${settings.announcement_channel_id}>` : "⚠️ Disabled"}`,
    `**Ignored channels:** ${ignoredChannels}`,
    `**Ignored roles:** ${ignoredRoles}`,
    `**Reward roles:** ${rewards}`,
  ].join("\n");
}

function buildPanel(settings) {
  const mainButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}toggle`)
      .setLabel(settings.enabled ? "Disable leveling" : "Enable leveling")
      .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}xp`)
      .setLabel("XP range")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}cooldown`)
      .setLabel("Cooldown")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}channels`)
      .setLabel("Channels")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}ignored-roles`)
      .setLabel("Ignored roles")
      .setStyle(ButtonStyle.Secondary),
  );
  const rewardButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}reward`)
      .setLabel("Reward role")
      .setStyle(ButtonStyle.Primary),
  );

  return new ContainerBuilder()
    .setAccentColor(settings.enabled ? 0x57f287 : 0xed4245)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(formatSettings(settings)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(mainButtons, rewardButton);
}

function panelResponse(settings, initial = false) {
  const response = {
    components: [buildPanel(settings)],
    allowedMentions: { parse: [] },
  };

  if (initial) {
    response.flags = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;
  }

  return response;
}

module.exports = {
  panelResponse,

  data: new SlashCommandBuilder()
    .setName("level-settings")
    .setDescription("Configure this server's leveling system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    await interaction.reply(panelResponse(settings.leveling, true));
  },
};
