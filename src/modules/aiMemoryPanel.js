const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const {
  AI_MEMORY_CATEGORIES,
  MAX_AI_MEMORY_CONTENT_LENGTH,
  MAX_AI_MEMORY_TITLE_LENGTH,
} = require("#modules/aiMemoryConstants");

const MEMORIES_PER_PAGE = 3;

function formatCategory(category) {
  return String(category || "other")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMemoryContent(content) {
  return String(content ?? "").trim();
}

function getMemoryUserId(interaction, scope) {
  if (!["user", "guild"].includes(scope)) {
    throw new RangeError("Unknown AI memory scope.");
  }
  if (scope === "guild" && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error("You need Manage Server to manage server-wide AI memory.");
  }
  return scope === "user" ? interaction.user.id : null;
}

function normalizePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 0 ? page : 0;
}

async function buildAiMemoryPanel(interaction, scope = "user", requestedPage = 0, notice = null) {
  const userId = getMemoryUserId(interaction, scope);
  const db = interaction.client.modules.db;
  const [settings, memories] = await Promise.all([
    db.getSettings(interaction.guildId),
    db.getAiMemories(interaction.guildId, scope, userId),
  ]);
  const pageCount = Math.max(1, Math.ceil(memories.length / MEMORIES_PER_PAGE));
  const page = Math.min(normalizePage(requestedPage), pageCount - 1);
  const firstMemoryIndex = page * MEMORIES_PER_PAGE;
  const visibleMemories = memories.slice(firstMemoryIndex, firstMemoryIndex + MEMORIES_PER_PAGE);
  const scopeName = scope === "guild" ? "Server memory" : "My memory";
  const canManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  const panel = new ContainerBuilder()
    .setAccentColor(settings.ai.memory_enabled ? 0x5865f2 : 0x747f8d)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "# 🧠 AI memory",
        `-# ${scopeName} • ${memories.length} saved • Page ${page + 1} of ${pageCount}`,
        `Memory is **${settings.ai.memory_enabled ? "enabled" : "paused"}** in this server.`,
        notice ? `> ${notice}` : null,
      ].filter(Boolean).join("\n")),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ai:memory:scope:user:0")
          .setLabel("My memory")
          .setStyle(scope === "user" ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(scope === "user"),
        ...(canManageGuild
          ? [
              new ButtonBuilder()
                .setCustomId("ai:memory:scope:guild:0")
                .setLabel("Server memory")
                .setStyle(scope === "guild" ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(scope === "guild"),
              new ButtonBuilder()
                .setCustomId(`ai:memory:toggle:${scope}:${page}`)
                .setLabel(settings.ai.memory_enabled ? "Pause memory" : "Enable memory")
                .setStyle(settings.ai.memory_enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
            ]
          : []),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    );

  if (visibleMemories.length) {
    for (const [index, memory] of visibleMemories.entries()) {
      if (index) {
        panel.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
        );
      }
      const updatedTimestamp = memory.updated_at
        ? Math.floor(new Date(memory.updated_at).getTime() / 1_000)
        : null;
      panel.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
              `### ${memory.title || memory.key || "Untitled memory"}`,
              `-# ${formatCategory(memory.category)}${updatedTimestamp ? ` • Updated <t:${updatedTimestamp}:R>` : ""}`,
              formatMemoryContent(memory.content || memory.value),
            ].join("\n")),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`ai:memory:delete:${scope}:${memory._id}:${page}`)
              .setEmoji("✖️")
              .setStyle(ButtonStyle.Danger),
          ),
      );
    }
  } else {
    panel.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        scope === "guild"
          ? "No server memories have been saved yet."
          : "You do not have any saved memories yet.",
      ),
    );
  }

  panel
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ai:memory:page:${scope}:${page - 1}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("⬅️")
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`ai:memory:jump:${scope}:${page}`)
          .setLabel(`Page ${page + 1} of ${pageCount}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageCount === 1),
        new ButtonBuilder()
          .setCustomId(`ai:memory:page:${scope}:${page + 1}`)
          .setEmoji("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= pageCount - 1),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ai:memory:add:${scope}:${page}`)
          .setLabel("Add")
          .setEmoji("➕")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ai:memory:correct:${scope}:${page}`)
          .setLabel("Correct")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!memories.length),
        new ButtonBuilder()
          .setCustomId(`ai:memory:clear:${scope}:${page}`)
          .setLabel("Clear all")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!memories.length),
      ),
    );

  return [panel];
}

function buildAddMemoryModal(scope, page) {
  return new ModalBuilder()
    .setCustomId(`ai:memory:add-modal:${scope}:${normalizePage(page)}`)
    .setTitle(scope === "guild" ? "Add server memory" : "Add personal memory")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Category")
        .setDescription("Choose where this memory belongs.")
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("memory-category")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(AI_MEMORY_CATEGORIES.map((category) => ({
              label: formatCategory(category),
              value: category,
            }))),
        ),
      new LabelBuilder()
        .setLabel("Title")
        .setDescription("A short, descriptive name for this memory.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("memory-title")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(MAX_AI_MEMORY_TITLE_LENGTH)
            .setRequired(true),
        ),
      new LabelBuilder()
        .setLabel("Memory")
        .setDescription("The complete information Food Machine should remember.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("memory-content")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(MAX_AI_MEMORY_CONTENT_LENGTH)
            .setRequired(true),
        ),
    );
}

function buildCorrectMemoryModal(scope, page) {
  return new ModalBuilder()
    .setCustomId(`ai:memory:correct-modal:${scope}:${normalizePage(page)}`)
    .setTitle(scope === "guild" ? "Correct server memory" : "Correct personal memory")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("What should be corrected?")
        .setDescription("One prompt can update multiple relevant memories.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("memory-correction")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Joining the Ciabi dev team only requires messaging @wheatwhole.")
            .setMaxLength(4_000)
            .setRequired(true),
        ),
    );
}

function buildJumpToMemoryPageModal(scope, page, pageCount) {
  return new ModalBuilder()
    .setCustomId(`ai:memory:jump-modal:${scope}:${normalizePage(page)}`)
    .setTitle("Jump to memory page")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Page number")
        .setDescription(`Enter a page from 1 to ${pageCount}.`)
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("memory-page")
            .setStyle(TextInputStyle.Short)
            .setValue(String(normalizePage(page) + 1))
            .setPlaceholder("1")
            .setMaxLength(String(pageCount).length)
            .setRequired(true),
        ),
    );
}

function buildClearMemoryConfirmation(scope, page, memoryCount) {
  const scopeName = scope === "guild" ? "server" : "personal";
  return [
    new ContainerBuilder()
      .setAccentColor(0xed4245)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
          `# Clear all ${scopeName} memories?`,
          `This permanently deletes ${memoryCount} memor${memoryCount === 1 ? "y" : "ies"}.`,
        ].join("\n")),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ai:memory:clear-confirm:${scope}:${normalizePage(page)}`)
            .setLabel("Clear all")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`ai:memory:page:${scope}:${normalizePage(page)}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
  ];
}

function panelResponse(components, initial = false) {
  return {
    components,
    ...(initial ? { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 } : {}),
    allowedMentions: { parse: [] },
  };
}

async function handleAiMemoryPanelInteraction(interaction) {
  if (!interaction.inGuild()) throw new Error("AI memory is only available in servers.");
  const parts = interaction.customId.split(":");
  const action = parts[2];
  const scope = parts[3];
  const page = normalizePage(parts.at(-1));
  const userId = getMemoryUserId(interaction, scope);
  const db = interaction.client.modules.db;

  if (interaction.isButton()) {
    if (action === "add") {
      await interaction.showModal(buildAddMemoryModal(scope, page));
      return;
    }
    if (action === "correct") {
      await interaction.showModal(buildCorrectMemoryModal(scope, page));
      return;
    }
    if (action === "jump") {
      const memories = await db.getAiMemories(interaction.guildId, scope, userId);
      const pageCount = Math.max(1, Math.ceil(memories.length / MEMORIES_PER_PAGE));
      await interaction.showModal(buildJumpToMemoryPageModal(scope, page, pageCount));
      return;
    }
    if (action === "clear") {
      const memories = await db.getAiMemories(interaction.guildId, scope, userId);
      await interaction.update(panelResponse(
        buildClearMemoryConfirmation(scope, page, memories.length),
      ));
      return;
    }

    await interaction.deferUpdate();
    let notice = null;
    let nextPage = page;
    if (action === "delete") {
      const memoryId = parts[4];
      const memories = await db.getAiMemories(interaction.guildId, scope, userId);
      const memory = memories.find((entry) => String(entry._id) === memoryId);
      const result = await db.deleteAiMemory(interaction.guildId, scope, userId, memoryId);
      notice = result.deletedCount
        ? `✅ Deleted **${memory?.title || "memory"}**.`
        : "That memory no longer exists.";
    } else if (action === "clear-confirm") {
      const result = await db.clearAiMemories(interaction.guildId, scope, userId);
      nextPage = 0;
      notice = `✅ Cleared ${result.deletedCount} memor${result.deletedCount === 1 ? "y" : "ies"}.`;
    } else if (action === "toggle") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new Error("You need Manage Server to change the AI memory setting.");
      }
      const settings = await db.getSettings(interaction.guildId);
      await db.setAiMemoryEnabled(interaction.guildId, !settings.ai.memory_enabled);
      notice = `✅ Memory is now ${settings.ai.memory_enabled ? "paused" : "enabled"}.`;
    } else if (!["page", "scope"].includes(action)) {
      throw new Error(`Unknown AI memory panel action: ${action}`);
    }

    const components = await buildAiMemoryPanel(interaction, scope, nextPage, notice);
    await interaction.editReply(panelResponse(components));
    return;
  }

  if (!interaction.isModalSubmit()) return;
  await interaction.deferUpdate();
  let notice;
  if (action === "add-modal") {
    const category = interaction.fields.getStringSelectValues("memory-category")[0];
    const memory = await db.createAiMemory(
      interaction.guildId,
      scope,
      userId,
      category,
      interaction.fields.getTextInputValue("memory-title"),
      interaction.fields.getTextInputValue("memory-content"),
      {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        createdByUserId: interaction.user.id,
      },
    );
    notice = `✅ ${memory.was_created ? "Added" : "Updated"} **${memory.title}**.`;
  } else if (action === "correct-modal") {
    const { correctAiMemories } = require("#modules/aiMemory");
    const existingMemories = await db.getAiMemories(interaction.guildId, scope, userId);
    const mutations = await correctAiMemories(
      interaction.fields.getTextInputValue("memory-correction"),
      scope,
      existingMemories,
    );
    const result = await db.applyAiMemoryMutations(
      interaction.guildId,
      scope,
      userId,
      mutations,
      {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        createdByUserId: interaction.user.id,
      },
    );
    const changes = [
      result.created.length ? `${result.created.length} added` : null,
      result.updated.length ? `${result.updated.length} corrected` : null,
      result.deletedCount ? `${result.deletedCount} deleted` : null,
    ].filter(Boolean).join(", ");
    notice = changes ? `✅ ${changes}.` : "No relevant memory changes were needed.";
  } else if (action === "jump-modal") {
    const requestedPage = Number(interaction.fields.getTextInputValue("memory-page").trim());
    const memories = await db.getAiMemories(interaction.guildId, scope, userId);
    const pageCount = Math.max(1, Math.ceil(memories.length / MEMORIES_PER_PAGE));
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > pageCount) {
      notice = `Enter a page number from 1 to ${pageCount}.`;
    } else {
      const components = await buildAiMemoryPanel(interaction, scope, requestedPage - 1);
      await interaction.editReply(panelResponse(components));
      return;
    }
  } else {
    throw new Error(`Unknown AI memory modal action: ${action}`);
  }

  const components = await buildAiMemoryPanel(interaction, scope, page, notice);
  await interaction.editReply(panelResponse(components));
}

module.exports = {
  buildAiMemoryPanel,
  handleAiMemoryPanelInteraction,
  panelResponse,
};
