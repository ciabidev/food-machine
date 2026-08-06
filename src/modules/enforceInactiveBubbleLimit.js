const {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require("discord.js");

module.exports = async function enforceInactiveBubbleLimit(client, guild, inactiveLimit) {
  const db = client.modules.db;

  if (!inactiveLimit) {
    await db.clearOtherBubbleInactiveWarnings(guild.id);
    return { evictedCount: 0 };
  }

  const inactiveBubbles = await db.getInactiveBubbles(guild.id);
  const bubblesToEvict = inactiveBubbles.slice(
    0,
    Math.max(0, inactiveBubbles.length - inactiveLimit),
  );
  let evictedCount = 0;

  for (const bubble of bubblesToEvict) {
    const channel = await guild.channels
      .fetch(String(bubble.channel_id))
      .catch(() => null);

    if (channel) {
      const deleted = await channel
        .delete("Inactive bubble channel limit reached")
        .then(() => true)
        .catch(() => false);
      if (!deleted) continue;

      const bubbleHost = await client.users
        .fetch(String(bubble.host_id))
        .catch(() => null);
      await bubbleHost?.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xf87171)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                [
                  "# Bubble Channel Auto-Popped",
                  `> **Bubble »** ${bubble.name || channel.name}`,
                  "Your inactive channel was removed because the server's inactive channel limit was exceeded.",
                  "-# Your bubble's settings are still saved.",
                ].join("\n"),
              ),
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      }).catch(() => null);
    }

    await db.clearBubbleChannel(guild.id, bubble.channel_id);
    evictedCount += 1;
  }

  const remainingInactiveBubbles = await db.getInactiveBubbles(guild.id);
  const nextBubble = remainingInactiveBubbles.length >= inactiveLimit
    ? remainingInactiveBubbles[0]
    : null;

  await db.clearOtherBubbleInactiveWarnings(guild.id, nextBubble?.host_id);

  if (nextBubble && !nextBubble.inactive_warning_sent_at) {
    const bubbleHost = await client.users
      .fetch(String(nextBubble.host_id))
      .catch(() => null);
    const warningSent = await bubbleHost?.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xf59e0b)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                "# Inactive Bubble Warning",
                `> **Bubble »** ${nextBubble.name || "Your bubble"}`,
                "Your bubble is next in line to have its inactive channel auto-popped when another channel needs space.",
                "Join the bubble hub to reactivate it and leave the inactive queue.",
                "-# Your bubble's settings will remain saved even if its channel is removed.",
              ].join("\n"),
            ),
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).then(() => true).catch(() => false);

    if (warningSent) {
      await db.setBubbleInactiveWarning(
        guild.id,
        nextBubble.host_id,
        new Date(),
      );
    }
  }

  return { evictedCount };
};
