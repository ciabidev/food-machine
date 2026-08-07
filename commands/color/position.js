const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("position")
    .setDescription("[Admin] Set where cosmetic color roles are placed")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Place color roles directly below this role")
        .setRequired(true)),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: "You need Manage Roles to position color roles.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const anchorRole = interaction.options.getRole("role", true);
    const colors = await interaction.client.modules.db.getColors(interaction.guildId);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const positionedCount = await interaction.client.modules.positionColorRoles(
        interaction.guild,
        colors,
        anchorRole.id,
      );

      await interaction.client.modules.db.setColorAnchor(interaction.guildId, anchorRole.id);
      await interaction.editReply({
        content: positionedCount
          ? `Positioned ${positionedCount} color role(s) directly below ${anchorRole}.`
          : `Future color roles will be placed directly below ${anchorRole}.`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      await interaction.editReply({ content: error.message });
    }
  },
};
