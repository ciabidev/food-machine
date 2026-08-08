const {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("Add as AI sample message")
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to add AI sample messages.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.targetMessage.author.bot) {
      await interaction.reply({
        content: "Bot messages cannot be saved as human-style AI samples.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sampleMessage = interaction.targetMessage.content.trim();
    if (!sampleMessage) {
      await interaction.reply({
        content: "That message has no text to save as an AI sample.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.client.modules.db.addAiSampleMessages(
      interaction.guildId,
      [sampleMessage],
    );
    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    await interaction.reply({
      content: `Added that message as an AI sample. ${settings.ai.sample_messages.length} sample${settings.ai.sample_messages.length === 1 ? " is" : "s are"} now saved for this server.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
