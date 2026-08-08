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
    .setName("samplemessages")
    .setDescription("Add human-style sample messages for the AI."),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to add AI sample messages.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("ai:samplemessages")
        .setTitle("AI sample messages")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("Sample messages")
            .setDescription("Separate examples with a blank line. The newest 20 are kept.")
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId("sample-messages")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("bro what\nthat is actually wild\nno shot")
                .setMaxLength(4_000)
                .setRequired(true),
            ),
        ),
    );
  },
};
