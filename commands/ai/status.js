const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandSubcommandBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { aiCooldownMs, aiFallbackModel, aiModel } = require("#config");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("status")
    .setDescription("Show the Food Machine AI status."),

  async execute(interaction) {
    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    const enabled = settings.ai.enabled;
    const rulesChannelId = settings.ai.rules_channel_id || interaction.guild.rulesChannelId;
    const rulesChannel = rulesChannelId
      ? interaction.guild.channels.cache.get(rulesChannelId)
      : null;

    await interaction.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(enabled ? 0x57f287 : 0xed4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                "## 🍔 Food Machine AI",
                `-# ${enabled ? "Ready to respond when members mention the bot." : "Currently disabled in this server."}`,
              ].join("\n"),
            ),
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                "### Status",
                `**AI replies:** ${enabled ? "🟢 Enabled" : "🔴 Disabled"}`,
                `**Provider:** Google Gemini`,
              ].join("\n"),
            ),
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                "### Runtime",
                `**Model:** \`${aiModel}\``,
                `**Fallback model:** \`${aiFallbackModel}\``,
                `**Cooldown:** \`${aiCooldownMs}ms\``,
              ].join("\n"),
            ),
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                "### Server context",
                `**Rules channel:** ${rulesChannel ? `<#${rulesChannel.id}>` : "Not configured"}`,
                `**Style samples:** \`${settings.ai.sample_messages.length}\``,
              ].join("\n"),
            ),
          ),
      ],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  },
};
