const { ChannelType, Events, PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const db = newState.client.modules.db;
    const guildId = newState.guild.id;
    const settings = await db.getSettings(guildId);
    const hubChannelId = settings.bubble.hub_channel_id;
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (hubChannelId && newChannelId === hubChannelId && oldChannelId !== hubChannelId) {
      const host = newState.member;
      const hubCategory = newState.channel?.parent || null;
      const bubble = await db.getBubble(guildId, null, host.user.id);
      const bubbleName = bubble?.name || `${host.user.username}'s Bubble`;

      try {
        let bubbleChannel = bubble?.channel_id
          ? await newState.client.modules.fetchChannel(
            newState.client,
            bubble.channel_id,
          )
          : null;

        if (!bubbleChannel) {
          const deniedPermissions = [];
          if (bubble?.locked) deniedPermissions.push(PermissionFlagsBits.Connect);
          if (bubble?.hidden) deniedPermissions.push(PermissionFlagsBits.ViewChannel);

          bubbleChannel = await newState.guild.channels.create({
            name: bubbleName,
            parent: hubCategory,
            type: ChannelType.GuildVoice,
            userLimit: bubble?.user_limit || 0,
            permissionOverwrites: deniedPermissions.length
              ? [
                { id: newState.guild.roles.everyone.id, deny: deniedPermissions },
                { id: host.user.id, allow: deniedPermissions },
              ]
              : [],
            reason: "Temporary voice channel creation",
          });

          try {
            await db.addBubble(
              guildId,
              bubbleChannel.id,
              host.user.id,
              bubbleName,
            );
          } catch (error) {
            await bubbleChannel.delete("Failed to attach channel to bubble").catch(() => null);
            throw error;
          }
        } else {
          await bubbleChannel.setParent(hubCategory, { lockPermissions: true });
        }

        if (bubble?.locked || bubble?.hidden) {
          await bubbleChannel.permissionOverwrites.edit(
            newState.guild.roles.everyone,
            {
              Connect: bubble.locked ? false : null,
              ViewChannel: bubble.hidden ? false : null,
            },
          );
          await bubbleChannel.permissionOverwrites.edit(
            host.user.id,
            {
              Connect: bubble.locked ? true : null,
              ViewChannel: bubble.hidden ? true : null,
            },
          );
        }

        if (!bubble?.name) {
          await db.setBubbleName(guildId, host.user.id, bubbleName);
        }

        await host.voice.setChannel(bubbleChannel.id, "Moved to bubble channel");
      } catch (error) {
        console.error(`Error creating bubble: ${error}`);
      }
    }

    if (oldChannelId && oldChannelId !== newChannelId) {
      try {
        const bubble = await db.getBubble(guildId, oldChannelId);
        if (!bubble) return;

        const oldChannel = await oldState.guild.channels.fetch(oldChannelId).catch(() => null);
        if (!oldChannel || oldChannel.members.size !== 0) return;

        const inactiveCategoryId = settings.bubble.inactive_category_id;
        const inactiveCategory = inactiveCategoryId
          ? oldState.guild.channels.cache.get(inactiveCategoryId)
            || await oldState.guild.channels.fetch(inactiveCategoryId).catch(() => null)
          : null;

        if (inactiveCategory?.type === ChannelType.GuildCategory) {
          await oldChannel.setParent(inactiveCategory, { lockPermissions: true });
          return;
        }

        if (inactiveCategoryId) {
          await db.setBubbleInactiveCategory(guildId, null);
        }

        await oldChannel.delete("Empty temporary bubble channel");
        await db.clearBubbleChannel(guildId, oldChannelId);
      } catch (error) {
        console.error("Failed to deactivate empty bubble:", error);
      }
    }
  },
};
