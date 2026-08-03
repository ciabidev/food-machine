const {
  ContainerBuilder,
  Events,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require("discord.js");

function formatOrdinal(number) {
  const lastTwoDigits = number % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${number}th`;

  return `${number}${{ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th"}`;
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const settings = await member.client.modules.db.getSettings(member.guild.id);
    const channel = settings.welcome_channel_id
      ? member.guild.channels.cache.get(settings.welcome_channel_id)
      : null;

    if (!channel?.isSendable()) return;

    const joinPosition = formatOrdinal(member.guild.memberCount);
    const components = [
      new ContainerBuilder().addSectionComponents(
        new SectionBuilder()
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(member.user.displayAvatarURL({ size: 256 })),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### Welcome <@${member.id}> to ${member.guild.name}!\n-# You are the ${joinPosition} user to join.`,
            ),
          ),
      ),
    ];

    await channel.send({
      components,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { users: [member.id] },
    });
  },
};
