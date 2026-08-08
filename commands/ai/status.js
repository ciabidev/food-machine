const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
} = require("discord.js");
const { aiCooldownMs, ollamaModel, ollamaUrl } = require("#config");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("status")
    .setDescription("Show the Food Machine AI status."),

  async execute(interaction) {

    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    await interaction.reply({
      content: [
        `**AI replies:** ${settings.ai.enabled ? "Enabled" : "Disabled"}`,
        `**Model:** \`${ollamaModel}\``,
        `**Ollama:** \`${ollamaUrl}\``,
        `**Cooldown:** \`${aiCooldownMs}ms\``,
        `**Style samples:** \`${settings.ai.sample_messages.length}\``,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  },
};
