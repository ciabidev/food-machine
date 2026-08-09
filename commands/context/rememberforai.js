const {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { extractAiMemory } = require("#modules/aiMemory");
const { aiAllowedGuildIds } = require("#config");

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("Remember for AI")
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),

  async execute(interaction) {
    const targetMessage = interaction.targetMessage;
    const canManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (aiAllowedGuildIds.size && !aiAllowedGuildIds.has(interaction.guildId)) {
      await interaction.reply({
        content: "AI features are not available in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (targetMessage.author.bot) {
      await interaction.reply({
        content: "Bot messages cannot be saved as user memories.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (targetMessage.author.id !== interaction.user.id && !canManageGuild) {
      await interaction.reply({
        content: "You can only save your own messages as memories.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!targetMessage.content.trim()) {
      await interaction.reply({
        content: "That message has no text to remember.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    if (!settings.ai.memory_enabled) {
      await interaction.reply({
        content: "AI memory is disabled in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const extractedMemory = await extractAiMemory(targetMessage);
      if (!extractedMemory) {
        await interaction.editReply(
          "I couldn't find a safe, meaningful memory in that message and its nearby context.",
        );
        return;
      }

      const memory = await interaction.client.modules.db.saveAiMemory(
        interaction.guildId,
        "user",
        targetMessage.author.id,
        extractedMemory.key,
        extractedMemory.value,
        {
          channelId: targetMessage.channelId,
          messageId: targetMessage.id,
          createdByUserId: interaction.user.id,
        },
      );
      await interaction.editReply({
        content: `Remembered \`${memory.key}\`: ${memory.value}`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error("Failed to extract an AI memory:", error);
      await interaction.editReply(
        "I couldn't create a memory from that message. Please try again in a bit.",
      );
    }
  },
};
