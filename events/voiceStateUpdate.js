const {
  ChannelType,
  Events,
  PermissionFlagsBits,
  MessageFlags,
  TextDisplayBuilder,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} = require("discord.js");

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
      const defaultBubbleName = await newState.client.modules.messageVariables
        .replaceMessageVariables(settings.bubble.channel_name, host, newState.channel);
      const bubbleName = bubble?.name || defaultBubbleName;

      try {
        let bubbleChannel = bubble?.channel_id
          ? await newState.client.modules.fetchChannel(newState.client, bubble.channel_id)
          : null;

        if (!bubbleChannel) {
          const deniedPermissions = [];
          if (bubble?.locked) deniedPermissions.push(PermissionFlagsBits.Connect);
          if (bubble?.hidden) deniedPermissions.push(PermissionFlagsBits.ViewChannel);
          const permissionOverwrites = [];
          if (deniedPermissions.length) {
            permissionOverwrites.push(
              { id: newState.guild.roles.everyone.id, deny: deniedPermissions },
              { id: host.user.id, allow: deniedPermissions },
            );
          }
          for (const userId of bubble?.trusted_user_ids || []) {
            permissionOverwrites.push({
              id: userId,
              allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
            });
          }
          for (const userId of bubble?.banned_user_ids || []) {
            permissionOverwrites.push({
              id: userId,
              deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
            });
          }

          bubbleChannel = await newState.guild.channels.create({
            name: newState.client.modules.bubbleChannelName(bubbleName),
            parent: hubCategory,
            type: ChannelType.GuildVoice,
            userLimit: bubble?.user_limit || 0,
            permissionOverwrites,
            reason: "Temporary voice channel creation",
          });

          try {
            await db.addBubble(guildId, bubbleChannel.id, host.user.id, bubbleName);
          } catch (error) {
            await bubbleChannel.delete("Failed to attach channel to bubble").catch(() => null);
            throw error;
          }
        } else {
          await bubbleChannel.setParent(hubCategory, { lockPermissions: true });
        }

        if (bubble?.locked || bubble?.hidden) {
          await bubbleChannel.permissionOverwrites.edit(newState.guild.roles.everyone, {
            Connect: bubble.locked ? false : null,
            ViewChannel: bubble.hidden ? false : null,
          });
          await bubbleChannel.permissionOverwrites.edit(host.user.id, {
            Connect: bubble.locked ? true : null,
            ViewChannel: bubble.hidden ? true : null,
          });
        }
        if (bubble?.trusted_user_ids?.length || bubble?.banned_user_ids?.length) {
          await newState.client.modules.applyBubblePermissions(
            bubbleChannel,
            bubble,
          );
        }

        if (!bubble?.name) {
          await db.setBubbleName(guildId, host.user.id, bubbleName);
        }
        await db.setBubbleInactiveSince(guildId, host.user.id, null);
        await newState.client.modules.enforceInactiveBubbleLimit(
          newState.client,
          newState.guild,
          settings.bubble.inactive_channel_limit,
        );

        await host.voice.setChannel(bubbleChannel.id, "Moved to bubble channel");
        const avatarUrl = host.user.displayAvatarURL();
        if (bubble?.guide_message_id) {
          const bubbleGuideMessage =
            bubbleChannel.messages.cache.get(bubble.guide_message_id) ||
            (await bubbleChannel.messages.fetch(bubble.guide_message_id).catch(() => null));

          if (bubbleGuideMessage) {
            await bubbleGuideMessage.delete();
          }
        }
        const components = [
          new ContainerBuilder()
            .setAccentColor(10475726)
            .addSectionComponents(
              new SectionBuilder()
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    [
                      `## Welcome to your bubble, ${host}!`,
                      `### Host Commands`,
                      `\`/bubble controls\``,
                      `> -# Configure your bubble's settings`,

                      `### Member commands`,
                      `\`/bubble info\``,
                      `> -# View information about this bubble`,
                    ].join("\n"),
                  ),
                ),
            ),
        ];

        const bubbleGuide = await bubbleChannel.send({
          components,
          flags: MessageFlags.IsComponentsV2,
        });

        await db.setBubbleGuideMessage(guildId, host.user.id, bubbleGuide.id);
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
        if (bubble.anchored) {
          await db.setBubbleInactiveSince(guildId, bubble.host_id, null);
          return;
        }

        const inactiveCategoryId = settings.bubble.inactive_category_id;
        const inactiveCategory = inactiveCategoryId
          ? oldState.guild.channels.cache.get(inactiveCategoryId) ||
            (await oldState.guild.channels.fetch(inactiveCategoryId).catch(() => null))
          : null;

        if (inactiveCategory?.type === ChannelType.GuildCategory) {
          await oldChannel.setParent(inactiveCategory, { lockPermissions: true });
          await db.setBubbleInactiveSince(guildId, bubble.host_id, new Date());
          await newState.client.modules.enforceInactiveBubbleLimit(
            newState.client,
            newState.guild,
            settings.bubble.inactive_channel_limit,
          );
          return;
        }

        if (inactiveCategoryId && inactiveCategory?.type !== ChannelType.GuildCategory) {
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
