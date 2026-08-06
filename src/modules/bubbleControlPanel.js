const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require("discord.js");

function buildButton(customId, label, style, emoji, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setStyle(style)
    .setLabel(label)
    .setEmoji({ name: emoji })
    .setDisabled(disabled);
}

function buildNoBubblePanel(settings) {
  const hubChannelId = settings.bubble.hub_channel_id;

  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# Bubble Control Panel\n${
          hubChannelId
            ? `Join <#${hubChannelId}> to create your bubble.`
            : "Bubble creation is currently disabled."
        }`,
      ),
    );
}

module.exports = {
  async bubbleControlPanel(interaction) {
    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    const bubble = await interaction.client.modules.db.getBubble(
      interaction.guildId,
      null,
      interaction.user.id,
    );

    if (!bubble) return [buildNoBubblePanel(settings)];

    const bubbleChannelId = bubble.channel_id ? String(bubble.channel_id) : null;
    const channel = bubbleChannelId
      ? interaction.guild.channels.cache.get(bubbleChannelId)
        || await interaction.guild.channels.fetch(bubbleChannelId).catch(() => null)
      : null;

    if (bubbleChannelId && !channel) {
      await interaction.client.modules.db.clearBubbleChannel(
        interaction.guildId,
        bubbleChannelId,
      );
    }

    const locked = bubble.locked ?? false;
    const hidden = bubble.hidden ?? false;
    const userLimit = channel?.userLimit ?? bubble.user_limit ?? 0;
    const bubbleName = bubble.name || channel?.name || `${interaction.user.username}'s Bubble`;
    const active = channel && (
      !settings.bubble.inactive_category_id
      || channel.parentId !== settings.bubble.inactive_category_id
    );

    return [
      new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              "# Bubble Control Panel",
              `Manage **${bubbleName}** using the buttons below`,
              `-# Status: ${active ? "Active" : "Inactive"}`,
            ].join("\n"),
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            buildButton(
              `bubble:user:info`,
              "Bubble Info",
              ButtonStyle.Primary,
              "ℹ️",
            ),
            buildButton(
              `bubble:user:rename`,
              "Rename",
              ButtonStyle.Secondary,
              "📝",
            ),
            buildButton(
              "bubble:user:limit",
              userLimit ? `Change User Limit (${userLimit})` : "Set User Limit",
              ButtonStyle.Secondary,
              "👥",
            ),
            buildButton(
              "bubble:user:pop",
              "Pop Bubble",
              ButtonStyle.Danger,
              "✖️",
            ),
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            buildButton(
              "bubble:user:togglelock",
              `${locked ? "Unlock" : "Lock"}`,
              ButtonStyle.Secondary,
              `${locked ? "🔓" : "🔒"}`,
            ),
            buildButton(
              "bubble:user:togglevisibility",
              hidden ? "Reveal" : "Hide",
              ButtonStyle.Secondary,
              hidden ? "🌥️" : "🌫️",
            ),
          ),
        ),
    ];
  },
};
