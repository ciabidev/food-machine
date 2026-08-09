const { MessageFlags, PermissionFlagsBits, SlashCommandSubcommandBuilder } = require("discord.js");
const { aiSamplesPanel } = require("#modules/aiSampleMessagesPanel");

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

    const components = await aiSamplesPanel(interaction);
    await interaction.reply({
      components,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
