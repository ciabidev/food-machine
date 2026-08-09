const {
  ApplicationCommandType,
  ContainerBuilder,
  ContextMenuCommandBuilder,
  FileBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require("discord.js");
const formatMilliseconds = require("#modules/formatMilliseconds");

function formatTokenCount(value) {
  return Number.isSafeInteger(value) ? value.toLocaleString("en-US") : "Unavailable";
}

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("View AI stats")
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),

  async execute(interaction) {
    if (interaction.targetMessage.author.id !== interaction.client.user.id) {
      await interaction.reply({
        content: "That message was not sent by this bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const stats = await interaction.client.modules.db.getAiMessageStats(
      interaction.targetId,
      interaction.guildId,
    );
    if (!stats) {
      await interaction.reply({
        content: "AI usage details are unavailable for that message.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const responseTime = stats.response_time_ms < 1_000
      ? `${stats.response_time_ms}ms`
      : formatMilliseconds(stats.response_time_ms);
    const canViewContext = stats.context_text && (
      stats.requester_id === interaction.user.id
      || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    );
    const container = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "## 📊 AI message stats",
            "-# Usage details for this Food Machine response",
          ].join("\n"),
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "### Performance",
            `> -# **Model:** \`${stats.model}\``,
            `> -# **Response time:** \`${responseTime}\``,
          ].join("\n"),
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "### Token usage",
            `> -# **Input:** \`${formatTokenCount(stats.input_tokens)}\``,
            `> -# **Output:** \`${formatTokenCount(stats.output_tokens)}\``,
            `> -# **Thinking:** \`${formatTokenCount(stats.thinking_tokens)}\``,
            `> -# **Total:** \`${formatTokenCount(stats.total_tokens)}\``,
          ].join("\n"),
        ),
      );

    if (canViewContext) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
      ).addFileComponents(
        new FileBuilder().setURL("attachment://ai-context.txt"),
      );
    }

    await interaction.reply({
      components: [container],
      files: canViewContext
        ? [{ attachment: Buffer.from(stats.context_text, "utf8"), name: "ai-context.txt" }]
        : [],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  },
};
