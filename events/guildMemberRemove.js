const {
  ContainerBuilder,
  Events,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require("discord.js");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const settings = await member.client.modules.db.getSettings(member.guild.id);
    const channels = settings.welcome_channel_ids
      .map((id) => member.guild.channels.cache.get(id))
      .filter((channel) => channel?.isSendable());

    if (channels.length === 0) return;

    await Promise.all(channels.map(async (channel) => {
      const content = (
        await member.client.modules.messageVariables.replaceMessageVariables(
          settings.leave_message,
          member,
          channel,
        )
      ).slice(0, 4_000);

      await channel.send({
        components: [
          new ContainerBuilder().addSectionComponents(
            new SectionBuilder()
              .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(member.user.displayAvatarURL({ size: 256 })),
              )
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
          ),
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }));
  },
};
