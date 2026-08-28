const {
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  ModalBuilder,
  SlashCommandSubcommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("channels")
    .setDescription("Choose where welcome and leave messages are sent."),

  async execute(interaction) {
    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId("welcome-settings:channels")
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(0)
      .setMaxValues(25)
      .setRequired(false);
    const defaults = settings.welcome_channel_ids
      .filter((id) => interaction.guild.channels.cache.has(id))
      .slice(0, 25);

    if (defaults.length) channelSelect.setDefaultChannels(...defaults);

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("welcome-settings:channels-modal")
        .setTitle("Welcome channels")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("Welcome and leave message channels")
            .setDescription("Clear every selection to disable these messages.")
            .setChannelSelectMenuComponent(channelSelect),
        ),
    );
  },
};
