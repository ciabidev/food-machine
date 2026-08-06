const {
  ChannelSelectMenuBuilder,
  ChannelType,
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
    const inactiveLimit = new TextInputBuilder()
      .setCustomId("inactive-limit")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("No limit")
      .setRequired(false)
      .setMaxLength(2);
    const anchoredLimit = new TextInputBuilder()
      .setCustomId("anchored-limit")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Disabled")
      .setRequired(false)
      .setMaxLength(2);
    const channelPrefix = new TextInputBuilder()
      .setCustomId("channel-prefix")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("No prefix")
      .setRequired(false)
      .setMaxLength(25);

    if (settings.bubble.inactive_channel_limit) {
      inactiveLimit.setValue(String(settings.bubble.inactive_channel_limit));
    }
    if (settings.bubble.anchored_channel_limit) {
      anchoredLimit.setValue(String(settings.bubble.anchored_channel_limit));
    }
    if (settings.bubble.channel_prefix) {
      channelPrefix.setValue(settings.bubble.channel_prefix);
    }

    if (
      settings.bubble.hub_channel_id &&
      interaction.guild.channels.cache.has(settings.bubble.hub_channel_id)
    ) {
      hub.setDefaultChannels(settings.bubble.hub_channel_id);
    }

    if (
      settings.bubble.inactive_category_id &&
      interaction.guild.channels.cache.has(settings.bubble.inactive_category_id)
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
            .setDescription(
              "Bubbles with no members will be moved to this category. (Private category recommended)",
            )
            .setChannelSelectMenuComponent(inactiveCategory),

          new LabelBuilder()
            .setLabel("Inactive Channel Limit*")
            .setDescription(
              "Oldest inactive channels are removed first. Leave blank or enter 0 for no limit.",
            )
            .setTextInputComponent(inactiveLimit),
          new LabelBuilder()
            .setLabel("Anchored Channel Limit")
            .setDescription(
              "Users can anchor their bubble to keep it active, even after leaving it. Leave blank to disable.",
            )
            .setTextInputComponent(anchoredLimit),
          new LabelBuilder()
            .setLabel("Bubble Channel Prefix")
            .setDescription("Added before every bubble channel name with a space. Leave blank for none.")
            .setTextInputComponent(channelPrefix),
        ),
    );
  },
};
