const {
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("serversettings")
    .setDescription("[Admin] Configure temporary bubble channels"),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to change bubble settings.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    const hub = new ChannelSelectMenuBuilder()
      .setCustomId("bubble:admin:settings:hub")
      .setChannelTypes(ChannelType.GuildVoice)
      .setMinValues(0)
      .setMaxValues(1)
      .setRequired(false);
    const inactiveCategory = new ChannelSelectMenuBuilder()
      .setCustomId("bubble:admin:settings:inactive-category")
      .setChannelTypes(ChannelType.GuildCategory)
      .setMinValues(0)
      .setMaxValues(1)
      .setRequired(false);

    if (
      settings.bubble.hub_channel_id
      && interaction.guild.channels.cache.has(settings.bubble.hub_channel_id)
    ) {
      hub.setDefaultChannels(settings.bubble.hub_channel_id);
    }

    if (
      settings.bubble.inactive_category_id
      && interaction.guild.channels.cache.has(settings.bubble.inactive_category_id)
    ) {
      inactiveCategory.setDefaultChannels(settings.bubble.inactive_category_id);
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("bubble:admin:settings")
        .setTitle("Bubble settings")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("Creation hub")
            .setDescription("Members who join this voice channel receive a new bubble.")
            .setChannelSelectMenuComponent(hub),
          new LabelBuilder()
            .setLabel("Inactive category")
            .setDescription("Bubbles with no members will be moved to this category. (Private category recommended)")
            .setChannelSelectMenuComponent(inactiveCategory),
        ),
    );
  },
};
