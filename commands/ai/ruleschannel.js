const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("ruleschannel")
    .setDescription("Set the channel containing rules the AI must follow.")
    .addChannelOption((option) => option
      .setName("channel")
      .setDescription("Leave empty to use Discord's configured server rules channel.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to change the AI rules channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");
    const botPermissions = channel?.permissionsFor(interaction.client.user);
    if (channel && !botPermissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
    ])) {
      await interaction.reply({
        content: "I need View Channel and Read Message History in that channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.client.modules.db.setAiRulesChannel(
      interaction.guildId,
      channel?.id || null,
    );
    await interaction.reply({
      content: channel
        ? `Food Machine will follow the rules in #${channel.name}.`
        : "Food Machine will use Discord's configured server rules channel.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
