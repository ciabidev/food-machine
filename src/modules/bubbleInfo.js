const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const escapeMarkdown = require("#modules/escapeMarkdown");

module.exports = function bubbleInfo(bubble, settings, channel) {
  const locked = bubble.locked ?? false;
  const hidden = bubble.hidden ?? false;
  const anchored = bubble.anchored ?? false;
  const userLimit = channel?.userLimit ?? bubble.user_limit ?? 0;
  const active = Boolean(
    channel &&
    (!settings.bubble.inactive_category_id ||
      channel.parentId !== settings.bubble.inactive_category_id),
  );
  const bubbleName = bubble.name || channel?.name || "Bubble";
  const channelStatus = channel
    ? `${active ? "🟢" : "⚪"} <#${channel.id}>`
    : "⚪ Channel unavailable";
  const lifecycle = anchored
    ? "⚓ **Anchored** · This channel remains active when everyone leaves."
    : settings.bubble.inactive_category_id
      ? "⚓ **Not anchored** · This channel moves to the inactive category when everyone leaves."
      : "⚓ **Not anchored** · This temporary channel is removed when everyone leaves.";

  return [
    new ContainerBuilder()
      .setAccentColor(active ? 0x57f287 : 0x95a5a6)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `# 🫧 ${escapeMarkdown(bubbleName)}`,
            channelStatus,
            `-# ${lifecycle}`,
          ].join("\n"),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `## 👥 ${channel?.members.size || 0}/${userLimit || "∞"} members`,
            `**Privacy:** ${locked ? "Locked" : "Unlocked"} and ${hidden ? "hidden" : "visible"}`,
            `-# 🤝 ${(bubble.trusted_user_ids || []).length} trusted · 🚫 ${(bubble.banned_user_ids || []).length} banned`,
          ].join("\n"),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`bubble:user:info-update:${bubble.host_id}`)
            .setLabel("Update")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
  ];
};
