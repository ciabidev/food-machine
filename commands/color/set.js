const { SlashCommandSubcommandBuilder } = require("discord.js");
const setColorRole = require("#modules/setColorRole");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("set")
    .setDescription("Change or remove your cosmetic color")
    .addStringOption((option) => option
      .setName("color")
      .setDescription("Color name or hex; leave empty to remove your color")
      .setAutocomplete(true)
      .setRequired(false)),

  async execute(interaction) {
    await setColorRole(interaction, interaction.options.getString("color"));
  },

  async autocomplete(interaction) {
    const query = interaction.options.getFocused().toLowerCase();
    const colors = interaction.client.modules.colorPalette.sortColors(
      await interaction.client.modules.db.getColors(interaction.guildId),
    );
    await interaction.respond(
      colors
        .filter((color) =>
          !query ||
          color.hex.toLowerCase().includes(query.replace(/^#/, "")) ||
          color.name?.toLowerCase().includes(query))
        .slice(0, 25)
        .map((color) => ({
          name: `${color.name || `#${color.hex}`} (#${color.hex})`.slice(0, 100),
          value: color.role_id,
        })),
    );
  },
};
