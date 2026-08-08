const {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
} = require("discord.js");
const formatMilliseconds = require("#modules/formatMilliseconds");

function buildData(client) {
  const applicationName = client.application.name || client.user.username;
  const name = `Ask ${applicationName}`.slice(0, 32);

  return new ContextMenuCommandBuilder()
    .setName(name)
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false);
}

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("Ask Food Machine")
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),
  buildData,

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let result;
    try {
      result = await interaction.client.modules.ai.handleMessage(
        interaction.targetMessage,
        { force: true, throwOnError: true },
      );
    } catch (error) {
      console.error("Failed to ask AI from a message context command:", error);
      await interaction.editReply(`The AI request failed: ${error.message}`);
      return;
    }

    if (result.status === "replied") {
      await interaction.editReply("Asked the AI to respond to that message.");
      return;
    }

    if (result.status === "cooldown") {
      await interaction.editReply(
        `The AI is on cooldown for another ${formatMilliseconds(Math.ceil(result.retryAfterMs))}.`,
      );
      return;
    }

    if (result.status === "busy") {
      await interaction.editReply("The AI is already responding in this channel.");
      return;
    }

    if (result.status === "disabled") {
      await interaction.editReply("AI is disabled in this server. Enable it with `/ai enable` first.");
      return;
    }

    if (result.status === "missing-permissions") {
      await interaction.editReply(
        "The bot needs View Channel, Read Message History, and Send Messages in this channel.",
      );
      return;
    }

    if (result.status === "guild-not-allowed") {
      await interaction.editReply("This server is not included in `AI_ALLOWED_GUILD_IDS`.");
      return;
    }

    if (result.status === "unsupported-channel" || result.status === "unavailable") {
      await interaction.editReply("That message is not in a supported server channel.");
      return;
    }

    await interaction.editReply(`The AI stopped without replying (${result.status}).`);
  },
};
