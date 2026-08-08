const {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("systemprompt")
    .setDescription("Customize the AI system prompt for this server."),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to customize the AI system prompt.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("ai:systemprompt")
        .setTitle("AI system prompt")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("System prompt")
            .setDescription("Leave blank to restore the default prompt. Maximum 4,000 characters.")
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId("system-prompt")
                .setStyle(TextInputStyle.Paragraph)
                .setValue(settings.ai.system_prompt)
                .setMaxLength(4_000)
                .setRequired(false),
            ),
        ),
    );
  },
};
