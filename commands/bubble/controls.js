const { MessageFlags, SlashCommandSubcommandBuilder } = require("discord.js");
const bubbleControlPanel = require("#modules/bubbleControlPanel");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("controls")
    .setDescription("Manage your bubble channel"),

  async execute(interaction) {
    const components = await bubbleControlPanel.bubbleControlPanel(interaction);

    await interaction.reply({
      components,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
