const { Events, ChannelType } = require("discord.js");

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const db = newState.client.modules.db;
    const guildId = newState.guild.id || oldState.guild.id;
    const settings = await db.getSettings(guildId);
    const hub_channel_id = settings?.bubble?.hub_channel_id;

    if (!hub_channel_id) return;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    // 1. HANDLE CREATION & JOINING THE HUB
    if (newChannelId === hub_channel_id && oldChannelId !== hub_channel_id) {
      const host = newState.member;
      const hubChannel = newState.guild.channels.cache.get(hub_channel_id);
      const hubCategory = hubChannel?.parent || null;
      const existingBubble = await db.getBubble(guildId, null, host.user.id);
      console.log(existingBubble);
      try {
        let bubbleChannel = null;
        if (existingBubble) {
          bubbleChannel = await newState.client.modules.fetchChannel(newState.client, existingBubble.channel_id);
          if (bubbleChannel === null) {
            await db.removeBubble(guildId, existingBubble.channel_id);
          }
        }
        const bubbleName = existingBubble?.name || `${host.user.username}'s Bubble`;
        if (bubbleChannel === null) {
          bubbleChannel = await newState.guild.channels.create({
            name: bubbleName,
            parent: hubCategory,
            type: ChannelType.GuildVoice,
            reason: "Temporary voice channel creation",
          });
          await host.voice.setChannel(bubbleChannel.id, "Moved to bubble channel");
          await db.addBubble(guildId, bubbleChannel.id, host.user.id);
        } else {
          await bubbleChannel.setParent(hubCategory);
          await host.voice.setChannel(bubbleChannel.id, "Moved to bubble channel");
        }
        // move user FIRST, then save to DB using .id to prevent instant deletion race condition
        

        if (!existingBubble?.name) {
          await db.setBubbleName(guildId, bubbleChannel.id, bubbleName);
        }
      } catch (error) {
        console.error(`Error creating bubble: ${error}`);
      }
    }

    // 2. LEAVING BUBBLES EMPTY
    if (oldChannelId && oldChannelId !== newChannelId) {
      try {
        const settings = await db.getSettings(guildId);
        const bubbleChannel = await db.getBubble(guildId, oldChannelId);
        const inactiveCategoryId = settings?.bubble?.inactive_category_id;
        if (bubbleChannel) {
          const oldChannel = await oldState.guild.channels.fetch(oldChannelId).catch(() => null);

          if (oldChannel && oldChannel.members.size === 0) {
            if (inactiveCategoryId) {
              oldChannel
                .setParent(inactiveCategoryId, { lockPermissions: true })
                .catch(console.error);
            } else {
              await oldChannel.delete("Empty temp channel").catch(() => null);
            }
          }
        }
      } catch (error) {
        console.error("Failed to delete empty temp channel:", error);
      }
    }
  },
};
