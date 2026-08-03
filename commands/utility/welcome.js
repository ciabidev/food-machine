const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Set or disable this server's welcome channel.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) => option
      .setName("channel")
      .setDescription("The welcome channel. Omit this option to disable welcomes.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to change the welcome channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");

    if (channel) {
      const permissions = channel.permissionsFor(interaction.guild.members.me);
      if (
        !permissions?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ])
      ) {
        await interaction.reply({
          content: "I need View Channel and Send Messages in the welcome channel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    await interaction.client.modules.db.setWelcomeChannel(
      interaction.guildId,
      channel?.id || null,
    );

    await interaction.reply({
      content: channel
        ? `Welcome messages will be sent in ${channel}.`
        : "Welcome messages have been disabled.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
