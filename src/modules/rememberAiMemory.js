const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { aiAllowedGuildIds } = require("#config");
const { extractAiMemory } = require("#modules/aiMemory");

module.exports = async function saveMessageAsAiMemory(interaction, scope) {
  const targetMessage = interaction.targetMessage;
  const serverMemory = scope === "guild";
  if (aiAllowedGuildIds.size && !aiAllowedGuildIds.has(interaction.guildId)) {
    await interaction.reply({
      content: "AI features are not available in this server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (targetMessage.author.bot) {
    await interaction.reply({
      content: "Bot messages cannot be saved as AI memories.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (serverMemory) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to create server-wide AI memories.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  } else if (targetMessage.author.id !== interaction.user.id) {
    await interaction.reply({
      content: "Only you can create or manage your personal AI memories.",
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
    const extractedMemory = await extractAiMemory(targetMessage, scope);
    if (!extractedMemory) {
      await interaction.editReply(
        `I couldn't find a safe, meaningful ${serverMemory ? "server" : "personal"} memory in that message and its nearby context.`,
      );
      return;
    }

    const memory = await interaction.client.modules.db.saveAiMemory(
      interaction.guildId,
      scope,
      serverMemory ? null : interaction.user.id,
      extractedMemory.key,
      extractedMemory.value,
      {
        guildId: interaction.guildId,
        channelId: targetMessage.channelId,
        messageId: targetMessage.id,
        createdByUserId: interaction.user.id,
      },
    );
    await interaction.editReply({
      content: `Remembered ${serverMemory ? "for this server" : "for you"} as \`${memory.key}\`: ${memory.value}`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error(`Failed to extract an AI ${scope} memory:`, error);
    await interaction.editReply(
      "I couldn't create a memory from that message. Please try again in a bit.",
    );
  }
};
