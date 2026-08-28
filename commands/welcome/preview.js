const {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SlashCommandSubcommandBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require("discord.js");

function buildPreview(title, content, avatarUrl) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSectionComponents(
      new SectionBuilder()
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content.slice(0, 3_970))),
    );
}

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("preview")
    .setDescription("Preview the welcome and leave messages."),

  async execute(interaction) {
    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    const replaceVariables = interaction.client.modules.messageVariables
      .replaceMessageVariables;
    const avatarUrl = interaction.user.displayAvatarURL({ size: 256 });
    const welcomeContent = await replaceVariables(
      settings.welcome_message,
      interaction.member,
      interaction.channel,
    );
    const leaveContent = await replaceVariables(
      settings.leave_message,
      interaction.member,
      interaction.channel,
    );
    const response = {
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    };

    await interaction.reply({
      ...response,
      components: [buildPreview("Welcome message", welcomeContent, avatarUrl)],
    });
    await interaction.followUp({
      ...response,
      components: [buildPreview("Leave message", leaveContent, avatarUrl)],
    });
  },
};
