const { MessageFlags, SlashCommandSubcommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("info")
    .setDescription("View information about a bubble"),

  async execute(interaction) {
    const db = interaction.client.modules.db;
    const voiceChannelId = interaction.member.voice.channelId;
    const bubble = voiceChannelId
      ? await db.getBubble(interaction.guildId, voiceChannelId)
        || await db.getBubble(interaction.guildId, null, interaction.user.id)
      : await db.getBubble(interaction.guildId, null, interaction.user.id);

    if (!bubble) {
      await interaction.reply({
        content: "You are not connected to a bubble and don't own one yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await db.getSettings(interaction.guildId);
    const channel = bubble.channel_id
      ? interaction.guild.channels.cache.get(bubble.channel_id) ||
        (await interaction.guild.channels.fetch(bubble.channel_id).catch(() => null))
      : null;

    if (bubble.channel_id && !channel) {
      await db.clearBubbleChannel(interaction.guildId, bubble.channel_id);
    }

    await interaction.reply({
      components: interaction.client.modules.bubbleInfo(bubble, settings, channel),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
