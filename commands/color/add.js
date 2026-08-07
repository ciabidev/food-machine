const {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("add")
    .setDescription("[Admin] Add or remove cosmetic colors"),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: "You need Manage Roles to edit the color palette.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const colors = interaction.client.modules.colorPalette.sortColors(
      await interaction.client.modules.db.getColors(interaction.guildId),
    );
    const input = new TextInputBuilder()
      .setCustomId("colors")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(["#FF0000  Red", "#00FF00  Green", "#0000FF  Blue"].join("\n"))
      .setRequired(false)
      .setMaxLength(4000);
    if (colors.length) {
      input.setValue(colors.map((color) =>
        `#${color.hex}${color.name ? `  ${color.name}` : ""}`).join("\n"));
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("color:admin:add")
        .setTitle("Edit color palette")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("One color per line: Hex  Optional name")
            .setDescription("Use two spaces before a name. Remove a line to remove its color role.")
            .setTextInputComponent(input),
        ),
    );
  },
};
