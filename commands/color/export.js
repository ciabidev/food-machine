const {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandSubcommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("export")
    .setDescription("Download this server's color palette"),

  async execute(interaction) {
    const colors = interaction.client.modules.colorPalette.sortColors(
      await interaction.client.modules.db.getColors(interaction.guildId),
    );
    if (!colors.length) {
      await interaction.reply({
        content: "There are no colors to export.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const palette = colors
      .map((color) => `#${color.hex}${color.name ? `  ${color.name}` : ""}`)
      .join("\n");
    await interaction.reply({
      content: `Exported ${colors.length} color${colors.length === 1 ? "" : "s"}.`,
      files: [
        new AttachmentBuilder(Buffer.from(`${palette}\n`, "utf8"), {
          name: "color-palette.txt",
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
