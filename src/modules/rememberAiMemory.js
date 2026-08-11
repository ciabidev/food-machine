const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { aiAllowedGuildIds } = require("#config");
const { extractAiMemoryMutations } = require("#modules/aiMemory");

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
  if (targetMessage.author.id === interaction.client.user.id) {
    await interaction.reply({
      content: "Food Machine's messages cannot be saved as AI memories.",
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
    const memoryUserId = serverMemory ? null : interaction.user.id;
    const existingMemories = await interaction.client.modules.db.getAiMemories(
      interaction.guildId,
      scope,
      memoryUserId,
    );
    const mutations = await extractAiMemoryMutations(
      targetMessage,
      scope,
      existingMemories,
    );
    if (!mutations.create.length && !mutations.update.length && !mutations.delete.length) {
      await interaction.editReply(
        `I couldn't find any safe, durable ${serverMemory ? "server" : "personal"} memory changes in that message.`,
      );
      return;
    }

    const result = await interaction.client.modules.db.applyAiMemoryMutations(
      interaction.guildId,
      scope,
      memoryUserId,
      mutations,
      {
        guildId: interaction.guildId,
        channelId: targetMessage.channelId,
        messageId: targetMessage.id,
        createdByUserId: interaction.user.id,
      },
    );

    const destination = serverMemory ? "for this server" : "for you";
    const changedMemories = [...result.created, ...result.updated];
    const changes = [
      result.created.length ? `${result.created.length} created` : null,
      result.updated.length ? `${result.updated.length} updated` : null,
      result.deletedCount ? `${result.deletedCount} deleted` : null,
    ].filter(Boolean).join(", ");
    const titles = changedMemories.map((memory) => `\`${memory.title}\``).join(", ");
    const content = `Updated memory ${destination}: ${changes}${titles ? ` — ${titles}` : ""}`;
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error(`Failed to create AI ${scope} memories:`, error);
    await interaction.editReply(
      "I couldn't create a memory from that message. Please try again in a bit.",
    );
  }
};
