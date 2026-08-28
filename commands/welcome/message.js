const {
  LabelBuilder,
  ModalBuilder,
  SlashCommandSubcommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("message")
    .setDescription("Customize the welcome and leave message templates."),

  async execute(interaction) {
    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("welcome-settings:message-modal")
        .setTitle("Welcome messages")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("Welcome message")
            .setDescription("Use variables such as {user.mention}, {guild.name}, and {channel.mention}.")
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId("welcome-message")
                .setStyle(TextInputStyle.Paragraph)
                .setValue(settings.welcome_message)
                .setMaxLength(4_000)
                .setRequired(true),
            ),
          new LabelBuilder()
            .setLabel("Leave message")
            .setDescription("The same user, guild, and channel variables are available here.")
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId("leave-message")
                .setStyle(TextInputStyle.Paragraph)
                .setValue(settings.leave_message)
                .setMaxLength(4_000)
                .setRequired(true),
            ),
        ),
    );
  },
};
