const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
} = require("discord.js");
const { aiCooldownMs, aiFallbackModel, aiModel } = require("#config");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("status")
    .setDescription("Show the Food Machine AI status."),

  async execute(interaction) {

    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    const rulesChannelId = settings.ai.rules_channel_id || interaction.guild.rulesChannelId;
    const rulesChannel = rulesChannelId
      ? interaction.guild.channels.cache.get(rulesChannelId)
      : null;
    await interaction.reply({
      content: [
        `**AI replies:** ${settings.ai.enabled ? "Enabled" : "Disabled"}`,
        `**Provider:** \`Google Gemini\``,
        `**Model:** \`${aiModel}\``,
        `**Fallback model:** \`${aiFallbackModel}\``,
        `**Cooldown:** \`${aiCooldownMs}ms\``,
        `**Style samples:** \`${settings.ai.sample_messages.length}\``,
        `**Rules channel:** ${rulesChannel ? `#${rulesChannel.name}` : "Not configured"}`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  },
};
