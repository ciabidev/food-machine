const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
} = require("discord.js");
const { aiCooldownMs, aiModel } = require("#config");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("status")
    .setDescription("Show the Food Machine AI status."),

  async execute(interaction) {

    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    await interaction.reply({
      content: [
        `**AI replies:** ${settings.ai.enabled ? "Enabled" : "Disabled"}`,
        `**Provider:** \`Google Gemini\``,
        `**Model:** \`${aiModel}\``,
        `**Cooldown:** \`${aiCooldownMs}ms\``,
        `**Style samples:** \`${settings.ai.sample_messages.length}\``,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  },
};
