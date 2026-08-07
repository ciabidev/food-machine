const {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandSubcommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("position")
    .setDescription("[Admin] Set where cosmetic color roles are placed"),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: "You need Manage Roles to position color roles.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId("anchor-role")
      .setMinValues(1)
      .setMaxValues(1)
      .setRequired(true);
    if (
      settings.color.anchor_role_id &&
      interaction.guild.roles.cache.has(settings.color.anchor_role_id)
    ) {
      roleSelect.setDefaultRoles(settings.color.anchor_role_id);
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("color:admin:position")
        .setTitle("Position color roles")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("Place color roles directly below")
            .setDescription("The selected role must be below the bot's highest role.")
            .setRoleSelectMenuComponent(roleSelect),
        ),
    );
  },
};
