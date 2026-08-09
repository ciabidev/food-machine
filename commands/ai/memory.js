const {
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandGroupBuilder,
  TextDisplayBuilder,
} = require("discord.js");

const MEMORIES_PER_VIEW = 10;

function addScopeOption(subcommand) {
  return subcommand.addStringOption((option) => option
    .setName("scope")
    .setDescription("Your memory follows you across servers; server memory stays in this server.")
    .addChoices(
      { name: "My global memory", value: "user" },
      { name: "This server's memory", value: "guild" },
    ));
}

function getMemoryTarget(interaction) {
  const scope = interaction.options.getString("scope") || "user";
  const canManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  if (scope === "guild" && !canManageGuild) {
    throw new Error("You need Manage Server to manage server-wide AI memories.");
  }

  return {
    scope,
    user: scope === "user" ? interaction.user : null,
  };
}

function formatMemoryValue(value) {
  const formatted = String(value).replace(/\s+/g, " ").trim();
  return formatted.length <= 250 ? formatted : `${formatted.slice(0, 249)}…`;
}

const data = new SlashCommandSubcommandGroupBuilder()
  .setName("memory")
  .setDescription("Manage persistent AI memories.")
  .addSubcommand((subcommand) => subcommand
    .setName("enable")
    .setDescription("Allow Food Machine to use saved memories in this server."))
  .addSubcommand((subcommand) => subcommand
    .setName("disable")
    .setDescription("Stop Food Machine from using saved memories in this server."))
  .addSubcommand((subcommand) => addScopeOption(subcommand
    .setName("view")
    .setDescription("View saved AI memories.")))
  .addSubcommand((subcommand) => addScopeOption(subcommand
    .setName("add")
    .setDescription("Add or update an AI memory.")
    .addStringOption((option) => option
      .setName("key")
      .setDescription("A short stable label, such as favorite_straw_hat.")
      .setMaxLength(50)
      .setRequired(true))
    .addStringOption((option) => option
      .setName("value")
      .setDescription("What Food Machine should remember.")
      .setMaxLength(500)
      .setRequired(true))))
  .addSubcommand((subcommand) => addScopeOption(subcommand
    .setName("forget")
    .setDescription("Forget one AI memory.")
    .addStringOption((option) => option
      .setName("key")
      .setDescription("The memory key to forget.")
      .setAutocomplete(true)
      .setRequired(true))))
  .addSubcommand((subcommand) => addScopeOption(subcommand
    .setName("clear")
    .setDescription("Clear all memories in the selected scope.")
    .addBooleanOption((option) => option
      .setName("confirm")
      .setDescription("Confirm that every selected memory should be removed.")
      .setRequired(true))));

async function execute(interaction) {
  const operation = interaction.options.getSubcommand();
  const db = interaction.client.modules.db;
  if (["enable", "disable"].includes(operation)) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You need Manage Server to change the AI memory setting.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const enabled = operation === "enable";
    await db.setAiMemoryEnabled(interaction.guildId, enabled);
    await interaction.reply({
      content: `AI memory is now ${enabled ? "enabled" : "disabled"}. Saved memories were not deleted.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let target;
  try {
    target = getMemoryTarget(interaction);
  } catch (error) {
    await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
    return;
  }

  if (operation === "view") {
    const memories = await db.getAiMemories(interaction.guildId, target.scope, target.user?.id);
    const visibleMemories = memories.slice(0, MEMORIES_PER_VIEW);
    const owner = target.scope === "guild" ? "Server" : "Your";
    const lines = [
      `# 🧠 ${owner} AI memories`,
      `-# ${memories.length} saved${memories.length > MEMORIES_PER_VIEW ? ` • showing newest ${MEMORIES_PER_VIEW}` : ""}`,
      "",
      ...visibleMemories.flatMap((memory) => [
        `### \`${memory.key}\``,
        formatMemoryValue(memory.value),
      ]),
    ];
    if (!memories.length) lines.push("No memories have been saved yet.");

    await interaction.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x5865f2)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n"))),
      ],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (operation === "add") {
    const memory = await db.saveAiMemory(
      interaction.guildId,
      target.scope,
      target.user?.id,
      interaction.options.getString("key", true),
      interaction.options.getString("value", true),
      {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        createdByUserId: interaction.user.id,
      },
    );
    await interaction.reply({
      content: `Remembered \`${memory.key}\`: ${memory.value}`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (operation === "forget") {
    const result = await db.deleteAiMemory(
      interaction.guildId,
      target.scope,
      target.user?.id,
      interaction.options.getString("key", true),
    );
    await interaction.reply({
      content: result.deletedCount ? "That memory was forgotten." : "No matching memory was found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.options.getBoolean("confirm", true)) {
    await interaction.reply({
      content: "Nothing was cleared because confirmation was set to false.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const result = await db.clearAiMemories(
    interaction.guildId,
    target.scope,
    target.user?.id,
  );
  await interaction.reply({
    content: `Cleared ${result.deletedCount} AI memor${result.deletedCount === 1 ? "y" : "ies"}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function autocomplete(interaction) {
  let target;
  try {
    target = getMemoryTarget(interaction);
  } catch {
    await interaction.respond([]);
    return;
  }

  const query = interaction.options.getFocused().toLowerCase();
  const memories = await interaction.client.modules.db.getAiMemories(
    interaction.guildId,
    target.scope,
    target.user?.id,
  );
  await interaction.respond(
    memories
      .filter((memory) => memory.key.includes(query) || memory.value.toLowerCase().includes(query))
      .slice(0, 25)
      .map((memory) => ({ name: `${memory.key}: ${formatMemoryValue(memory.value)}`.slice(0, 100), value: memory.key })),
  );
}

module.exports = { data, execute, autocomplete };
