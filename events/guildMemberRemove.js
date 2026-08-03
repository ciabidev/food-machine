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

    const components = [
      new ContainerBuilder().addSectionComponents(
        new SectionBuilder()
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(member.user.displayAvatarURL({ size: 256 })),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### Until next time, <@${member.id}>!\n-# <@${member.id}> has left the server. We now have ${member.guild.memberCount} members.`,
            ),
          ),
      ),
    ];

    await Promise.all(channels.map((channel) => channel.send({
      components,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    })));
  },
};
