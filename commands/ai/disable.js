const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("disable")
    .setDescription("Disable AI replies from the bot."),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to change the AI setting.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.client.modules.db.setAiEnabled(interaction.guildId, false);
    await interaction.reply({
      content: "Food-machine AI is now disabled.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
