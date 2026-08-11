const { SlashCommandSubcommandBuilder } = require("discord.js");
const {
  buildAiMemoryPanel,
  panelResponse,
} = require("#modules/aiMemoryPanel");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("memory")
    .setDescription("View and manage AI memory."),

  async execute(interaction) {
    const components = await buildAiMemoryPanel(interaction);
    await interaction.reply(panelResponse(components, true));
  },
};
