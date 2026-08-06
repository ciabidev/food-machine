const { Events } = require("discord.js");

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    const db = channel.client.modules.db;
    const guildId = channel.guild.id;

    try {
      await db.clearBubbleChannel(guildId, channel.id);

      const settings = await db.getSettings(guildId);
      if (settings.bubble.hub_channel_id === channel.id) {
        await db.setBubbleHub(guildId, null);
      }
      if (settings.bubble.inactive_category_id === channel.id) {
        await db.setBubbleInactiveCategory(guildId, null);
      }
    } catch (error) {
      console.error("Failed to clean up deleted channel references:", error);
    }
  },
};
