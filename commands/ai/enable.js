const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("enable")
    .setDescription("Enable AI replies when members mention the bot."),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to change the AI setting.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.client.modules.db.setAiEnabled(interaction.guildId, true);
    await interaction.reply({
      content: "Food-machine AI is now enabled. Mention me at the beginning of a message to get a reply.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
