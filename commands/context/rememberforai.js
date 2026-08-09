const {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("Remember for AI")
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),

  async execute(interaction) {
    const targetMessage = interaction.targetMessage;
    const canManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (targetMessage.author.bot) {
      await interaction.reply({
        content: "Bot messages cannot be saved as user memories.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (targetMessage.author.id !== interaction.user.id && !canManageGuild) {
      await interaction.reply({
        content: "You can only save your own messages as memories.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const messageText = targetMessage.content.trim();
    if (!messageText) {
      await interaction.reply({
        content: "That message has no text to remember.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(
          `ai:memory:message:${targetMessage.channelId}:${targetMessage.id}:${targetMessage.author.id}`,
        )
        .setTitle("Remember for AI")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("Memory key")
            .setDescription("A stable label, such as favorite_straw_hat.")
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId("memory-key")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setRequired(true),
            ),
          new LabelBuilder()
            .setLabel("Memory")
            .setDescription("Edit this into a durable fact, not a temporary event or joke.")
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId("memory-value")
                .setStyle(TextInputStyle.Paragraph)
                .setValue(messageText.slice(0, 500))
                .setMaxLength(500)
                .setRequired(true),
            ),
        ),
    );
  },
};
