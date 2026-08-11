const {
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  Events,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  TextDisplayBuilder,
  UserSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const pickerCommand = require("#commands/color/picker");
const {
  aiSamplesPanel,
  clearSamplesConfirmation,
} = require("#modules/aiSampleMessagesPanel");
const { handleAiMemoryPanelInteraction } = require("#modules/aiMemoryPanel");
const { issuesUrl } = require("#config");

async function replyWithError(interaction, error) {
  console.error(error);

  const issuePrompt = issuesUrl ? `\nReport persistent issues here: ${issuesUrl}` : "";
  const response = {
    content: `An error occurred while running that command.${issuePrompt}`,
    flags: MessageFlags.Ephemeral,
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(response);
  } else {
    await interaction.reply(response);
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);
    const db = interaction.client.modules.db;

    if (interaction.customId?.startsWith("ai:memory:")) {
      try {
        await handleAiMemoryPanelInteraction(interaction);
      } catch (error) {
        await replyWithError(interaction, error);
      }
      return;
    }

    if (interaction.customId === "ai:systemprompt" && interaction.isModalSubmit()) {
      try {
        if (
          !interaction.inGuild()
          || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
          await interaction.reply({
            content: "You need Manage Server to customize the AI system prompt.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const systemPrompt = interaction.fields.getTextInputValue("system-prompt");
        await db.setAiSystemPrompt(interaction.guildId, systemPrompt);
        await interaction.reply({
          content: systemPrompt.trim()
            ? "The AI system prompt has been saved for this server."
            : "The AI system prompt has been reset to the default.",
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        await replyWithError(interaction, error);
      }
      return;
    }

    if (interaction.customId?.startsWith("ai:samples:add-modal:") && interaction.isModalSubmit()) {
      try {
        if (
          !interaction.inGuild()
          || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
          await interaction.reply({
            content: "You need Manage Server to add AI sample messages.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const sampleMessages = interaction.fields
          .getTextInputValue("sample-messages")
          .split(/\r?\n\s*\r?\n/)
          .map((sampleMessage) => sampleMessage.trim())
          .filter(Boolean);

        await db.addAiSampleMessages(interaction.guildId, sampleMessages);
        const settings = await db.getSettings(interaction.guildId);
        const lastPage = Math.max(0, Math.ceil(settings.ai.sample_messages.length / 10) - 1);
        const components = await aiSamplesPanel(interaction, lastPage);
        await interaction.update({
          components,
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        await replyWithError(interaction, error);
      }
      return;
    }

    if (interaction.customId?.startsWith("ai:samples:") && interaction.isButton()) {
      try {
        if (
          !interaction.inGuild()
          || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
          await interaction.reply({
            content: "You need Manage Server to manage AI sample messages.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (interaction.customId.startsWith("ai:samples:page:")) {
          const page = Number(interaction.customId.split(":")[3]);
          const components = await aiSamplesPanel(
            interaction,
            Number.isInteger(page) ? page : 0,
          );
          await interaction.update({ components, allowedMentions: { parse: [] } });
          return;
        }

        if (interaction.customId.startsWith("ai:samples:add:")) {
          const page = Number(interaction.customId.split(":")[3]);
          await interaction.showModal(
            new ModalBuilder()
              .setCustomId(`ai:samples:add-modal:${Number.isInteger(page) ? page : 0}`)
              .setTitle("Add AI sample messages")
              .addLabelComponents(
                new LabelBuilder()
                  .setLabel("Sample messages")
                  .setDescription("Separate samples with a blank line. The newest 20 are kept.")
                  .setTextInputComponent(
                    new TextInputBuilder()
                      .setCustomId("sample-messages")
                      .setStyle(TextInputStyle.Paragraph)
                      .setPlaceholder("first sample\n\nsecond sample")
                      .setMaxLength(4_000)
                      .setRequired(true),
                  ),
              ),
          );
          return;
        }

        if (interaction.customId.startsWith("ai:samples:clear:")) {
          const page = Number(interaction.customId.split(":")[3]);
          const settings = await db.getSettings(interaction.guildId);
          const components = clearSamplesConfirmation(
            Number.isInteger(page) ? page : 0,
            settings.ai.sample_messages.length,
          );
          await interaction.update({ components, allowedMentions: { parse: [] } });
          return;
        }

        if (interaction.customId === "ai:samples:clear-confirm") {
          await db.clearAiSampleMessages(interaction.guildId);
          const components = await aiSamplesPanel(interaction);
          await interaction.update({ components, allowedMentions: { parse: [] } });
        }
      } catch (error) {
        await replyWithError(interaction, error);
      }
      return;
    }

    if (interaction.customId?.startsWith("color:picker:page:")) {
      if (interaction.isButton()) {
        try {
          const requestedPage = Number(interaction.customId.split(":")[3]);
          const colors = await db.getColors(interaction.guildId);
          if (!colors.length) {
            await interaction.reply({
              content: "There are no available colors in this palette.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);
          if (isEphemeral) {
            await interaction.deferUpdate();
          } else {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          }

          const page = await pickerCommand.buildColorPickerPage(
            interaction.client,
            colors,
            Number.isInteger(requestedPage) ? requestedPage : 0,
          );
          if (isEphemeral) page.attachments = [];
          await interaction.editReply(page);
        } catch (error) {
          await replyWithError(interaction, error);
        }
      }
      return;
    }

    if (interaction.customId === "color:picker:select") {
      if (interaction.isButton()) {
        try {
          const colors = await db.getColors(interaction.guildId);
          if (!colors.length) {
            await interaction.reply({
              content: "There are no available colors in this palette.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await interaction.showModal(
            new ModalBuilder()
              .setCustomId("color:picker:set")
              .setTitle("Choose a color")
              .addLabelComponents(
                new LabelBuilder()
                  .setLabel("Color name or hex")
                  .setDescription("Enter an exact palette name or hex. Leave empty to remove your color.")
                  .setTextInputComponent(
                    new TextInputBuilder()
                      .setCustomId("color")
                      .setStyle(TextInputStyle.Short)
                      .setPlaceholder("Lavender or #B57EDC")
                      .setRequired(false)
                      .setMaxLength(100),
                  ),
              ),
          );
        } catch (error) {
          await replyWithError(interaction, error);
        }
      }
      return;
    }

    if (interaction.customId === "color:picker:set") {
      if (interaction.isModalSubmit()) {
        try {
          const color = interaction.fields.getTextInputValue("color").trim() || null;
          await interaction.client.modules.setColorRole(interaction, color);
        } catch (error) {
          await replyWithError(interaction, error);
        }
      }
      return;
    }

    if (interaction.customId === "color:admin:add") {
      if (interaction.isModalSubmit()) {
        try {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
            await interaction.reply({
              content: "You need Manage Roles to edit the color palette.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          let desiredColors;
          try {
            desiredColors = interaction.client.modules.colorPalette.parseColors(
              interaction.fields.getTextInputValue("colors"),
            );
          } catch (error) {
            await interaction.reply({
              content: error.message,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const result = await interaction.client.modules.colorPalette.saveColors(
            interaction.client,
            interaction.guild,
            desiredColors,
          );
          const pickerUpdate = await pickerCommand
            .updateStoredColorPicker(interaction.client, interaction.guildId)
            .catch((error) => {
              console.error("Failed to update the saved color picker:", error);
              return "failed";
            });

          await interaction.editReply({
            content: [
              "Color palette saved.",
              `Added ${result.added} · Updated ${result.updated} · Removed ${result.removed}`,
              result.failed
                ? `Could not modify ${result.failed} role(s) above the bot's highest role.`
                : null,
              result.positionError
                ? `Roles were saved but not positioned: ${result.positionError}`
                : null,
              pickerUpdate === "missing"
                ? "The saved picker message no longer exists. Send a new one with `/color picker`."
                : null,
              pickerUpdate === "failed"
                ? "The palette was saved, but the picker message could not be updated."
                : null,
            ].filter(Boolean).join("\n"),
          });
        } catch (error) {
          await replyWithError(interaction, error);
        }
      }
      return;
    }

    if (interaction.customId === "bubble:admin:pop") {
      if (interaction.isModalSubmit()) {
        try {
          if (
            !interaction.inGuild() ||
            !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
          ) {
            await interaction.reply({
              content: "You need Manage Server to pop bubbles.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const selectedHostIds = interaction.fields.getStringSelectValues(
            "bubble:admin:pop:bubbles",
          );
          const reason = interaction.fields.getTextInputValue("bubble:admin:pop:reason").trim();

          if (!reason) {
            await interaction.reply({
              content: "A reason is required to pop bubbles.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const bubbleRecords = await db.getBubbles(interaction.guildId);
          const bubblesToDelete = selectedHostIds.length
            ? bubbleRecords.filter((bubble) => selectedHostIds.includes(String(bubble.host_id)))
            : bubbleRecords;
          let deletedCount = 0;
          let failedCount = 0;
          let notificationFailedCount = 0;

          await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
          });

          for (const bubble of bubblesToDelete) {
            const channelId = bubble.channel_id ? String(bubble.channel_id) : null;
            const channel = channelId
              ? await interaction.guild.channels.fetch(channelId).catch(() => null)
              : null;

            if (channel) {
              const channelDeleted = await channel
                .delete(`Bubble popped by ${interaction.user.tag}: ${reason}`)
                .then(() => true)
                .catch(() => false);
              if (!channelDeleted) {
                failedCount += 1;
                continue;
              }
            }

            deletedCount += 1;
            const bubbleName = bubble.name || channel?.name || "Your bubble";
            const bubbleHost = await interaction.client.users
              .fetch(String(bubble.host_id))
              .catch(() => null);

            if (
              !bubbleHost ||
              !(await bubbleHost
                .send({
                  components: [
                    new ContainerBuilder()
                      .setAccentColor(0xf87171)
                      .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                          [
                            "### Bubble popped",
                            `**Bubble:** ${bubbleName}`,
                            `**Reason:** ${reason}`,
                          ].join("\n"),
                        ),
                      ),
                  ],
                  flags: MessageFlags.IsComponentsV2,
                  allowedMentions: { parse: [] },
                })
                .then(() => true)
                .catch(() => false))
            ) {
              notificationFailedCount += 1;
            }

            await db.removeBubble(interaction.guildId, bubble.host_id);
          }

          const result = [`Popped ${deletedCount} bubble(s).`, `**Reason:** ${reason}`];
          if (failedCount) result.push(`-# Failed to delete ${failedCount}.`);
          if (notificationFailedCount) {
            result.push(`Could not notify ${notificationFailedCount} host(s).`);
          }

          await interaction.editReply({
            content: null,
            components: [
              new ContainerBuilder()
                .setAccentColor(0xf87171)
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    ["### Bubble pop complete", ...result].join("\n"),
                  ),
                ),
            ],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
          });
        } catch (error) {
          await replyWithError(interaction, error);
        }
      }
      return;
    }

    if (interaction.customId === "bubble:admin:settings") {
      if (interaction.isModalSubmit()) {
        try {
          if (
            !interaction.inGuild() ||
            !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
          ) {
            await interaction.reply({
              content: "You need Manage Server to change bubble settings.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const hub = interaction.fields.getSelectedChannels("bubble:admin:settings:hub")?.first();
          const inactiveCategory = interaction.fields
            .getSelectedChannels("bubble:admin:settings:inactive-category")
            ?.first();
          const inactiveLimitInput = interaction.fields.getTextInputValue("inactive-limit").trim();
          const inactiveLimit = inactiveLimitInput ? Number(inactiveLimitInput) : 0;
          const anchoredLimitInput = interaction.fields.getTextInputValue("anchored-limit").trim();
          const anchoredLimit = anchoredLimitInput ? Number(anchoredLimitInput) : 0;
          const channelPrefix = interaction.fields.getTextInputValue("channel-prefix").trim();

          if (
            (inactiveLimitInput && !/^\d+$/.test(inactiveLimitInput)) ||
            !Number.isInteger(inactiveLimit) ||
            inactiveLimit < 0 ||
            inactiveLimit > 99
          ) {
            await interaction.reply({
              content: "Inactive channel limit must be a whole number from 0 to 99.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          if (
            (anchoredLimitInput && !/^\d+$/.test(anchoredLimitInput)) ||
            !Number.isInteger(anchoredLimit) ||
            anchoredLimit < 0 ||
            anchoredLimit > 99
          ) {
            await interaction.reply({
              content: "Anchored channel limit must be a whole number from 0 to 99.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          await interaction.client.modules.db.setBubbleHub(interaction.guildId, hub?.id || null);
          await interaction.client.modules.db.setBubbleInactiveCategory(
            interaction.guildId,
            inactiveCategory?.id || null,
          );
          await interaction.client.modules.db.setBubbleInactiveLimit(
            interaction.guildId,
            inactiveLimit,
          );
          await interaction.client.modules.db.setBubbleAnchoredLimit(
            interaction.guildId,
            anchoredLimit,
          );
          await interaction.client.modules.db.setBubbleChannelPrefix(
            interaction.guildId,
            channelPrefix,
          );

          const anchoredBubbles = await interaction.client.modules.db.getAnchoredBubbles(
            interaction.guildId,
          );
          const removedAnchors = anchoredLimit
            ? anchoredBubbles.slice(anchoredLimit)
            : anchoredBubbles;
          for (const anchoredBubble of removedAnchors) {
            await interaction.client.modules.db.setBubbleAnchored(
              interaction.guildId,
              anchoredBubble.host_id,
              false,
            );

            const anchoredChannel = anchoredBubble.channel_id
              ? interaction.guild.channels.cache.get(anchoredBubble.channel_id) ||
                (await interaction.guild.channels
                  .fetch(anchoredBubble.channel_id)
                  .catch(() => null))
              : null;
            if (anchoredChannel && anchoredChannel.members.size === 0) {
              if (inactiveCategory?.type === ChannelType.GuildCategory) {
                await anchoredChannel.setParent(inactiveCategory, { lockPermissions: true });
                await interaction.client.modules.db.setBubbleInactiveSince(
                  interaction.guildId,
                  anchoredBubble.host_id,
                  new Date(),
                );
              } else {
                await anchoredChannel.delete("Anchoring limit was lowered");
                await interaction.client.modules.db.clearBubbleChannel(
                  interaction.guildId,
                  anchoredChannel.id,
                );
              }
            }

            const owner = await interaction.client.users
              .fetch(anchoredBubble.host_id)
              .catch(() => null);
            await owner
              ?.send({
                components: [
                  new ContainerBuilder()
                    .setAccentColor(0xf59e0b)
                    .addTextDisplayComponents(
                      new TextDisplayBuilder().setContent(
                        `## Bubble Unanchored\nYour bubble in **${interaction.guild.name}** was unanchored because the server's Anchoring limit was lowered.`,
                      ),
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
              })
              .catch(() => null);
          }

          const { evictedCount } = await interaction.client.modules.enforceInactiveBubbleLimit(
            interaction.client,
            interaction.guild,
            inactiveLimit,
          );

          const savedSettings = [
            "# Bubble Settings Saved",
            `> **Creation hub »** ${hub || "Disabled"}`,
            `> **Inactive category »** ${inactiveCategory || "Not set"}`,
            `> **Inactive channel limit »** ${inactiveLimit || "No limit"}`,
            `> **Anchored channel limit »** ${anchoredLimit || "Disabled"}`,
            `> **Bubble channel prefix »** ${channelPrefix ? `\`${channelPrefix}\`` : "None"}`,
            "-# Prefix changes apply when a bubble channel is created or renamed.",
          ];
          if (removedAnchors.length) {
            savedSettings.push(`-# Unanchored ${removedAnchors.length} excess bubble(s).`);
          }
          if (evictedCount) {
            savedSettings.push(`-# Removed ${evictedCount} excess inactive channel(s).`);
          }

          await interaction.editReply({
            content: null,
            components: [
              new ContainerBuilder()
                .setAccentColor(0x5865f2)
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(savedSettings.join("\n")),
                ),
            ],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
          });
        } catch (error) {
          await replyWithError(interaction, error);
        }
      }
      return;
    }

    if (interaction.customId?.startsWith("welcome-settings:")) {
      if (interaction.isModalSubmit()) {
        try {
          if (
            !interaction.inGuild() ||
            !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
          ) {
            await interaction.reply({
              content: "You need Manage Server to change the welcome channels.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const selectedChannels = interaction.fields.getSelectedChannels(
            "welcome-settings:channels",
          );
          const channels = selectedChannels ? [...selectedChannels.values()] : [];
          const inaccessibleChannel = channels.find((channel) => {
            const permissions = channel.permissionsFor(interaction.guild.members.me);
            return !permissions?.has([
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AddReactions,
            ]);
          });

          if (inaccessibleChannel) {
            await interaction.reply({
              content: `I need View Channel, Send Messages, Read Message History, and Add Reactions in ${inaccessibleChannel}.`,
              flags: MessageFlags.Ephemeral,
              allowedMentions: { parse: [] },
            });
            return;
          }

          await interaction.client.modules.db.setWelcomeChannels(
            interaction.guildId,
            channels.map((channel) => channel.id),
          );

          await interaction.reply({
            content: channels.length
              ? `Welcome and leave messages will be sent in ${channels.join(", ")}.`
              : "Welcome and leave messages have been disabled.",
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          });
        } catch (error) {
          await replyWithError(interaction, error);
        }
      }
      return;
    }

    if (interaction.customId?.startsWith("level-settings:")) {
      try {
        if (
          !interaction.inGuild() ||
          !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
          await interaction.reply({
            content: "You need Manage Server to change leveling settings.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const [, action] = interaction.customId.split(":");
        const levelSettingsCommand = require("#commands/levels/settings");

        if (interaction.isButton()) {
          const settings = await db.getSettings(interaction.guildId);

          switch (action) {
            case "toggle": {
              await db.setLevelingEnabled(interaction.guildId, !settings.leveling.enabled);
              const updated = await db.getSettings(interaction.guildId);
              await interaction.update(levelSettingsCommand.panelResponse(updated.leveling));
              break;
            }
            case "xp":
              await interaction.showModal(
                new ModalBuilder()
                  .setCustomId(`level-settings:xp-modal`)
                  .setTitle("XP range")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("Minimum XP")
                      .setDescription("A whole number from 1 to 100.")
                      .setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId("minimum")
                          .setStyle(TextInputStyle.Short)
                          .setValue(String(settings.leveling.xp_min))
                          .setPlaceholder("5")
                          .setRequired(true),
                      ),
                    new LabelBuilder()
                      .setLabel("Maximum XP")
                      .setDescription("Must be at least the minimum.")
                      .setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId("maximum")
                          .setStyle(TextInputStyle.Short)
                          .setValue(String(settings.leveling.xp_max))
                          .setPlaceholder("15")
                          .setRequired(true),
                      ),
                  ),
              );
              break;
            case "cooldown":
              await interaction.showModal(
                new ModalBuilder()
                  .setCustomId(`level-settings:cooldown-modal`)
                  .setTitle("XP cooldown")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("Cooldown in seconds")
                      .setDescription("A positive whole number")
                      .setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId("seconds")
                          .setStyle(TextInputStyle.Short)
                          .setValue(String(settings.leveling.cooldown_seconds))
                          .setPlaceholder("60")
                          .setRequired(true),
                      ),
                  ),
              );
              break;
            case "channels": {
              const announcement = new ChannelSelectMenuBuilder()
                .setCustomId("announcement-channel")
                .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setMinValues(0)
                .setMaxValues(1)
                .setRequired(false);
              const ignored = new ChannelSelectMenuBuilder()
                .setCustomId("ignored-channels")
                .setMinValues(0)
                .setMaxValues(25)
                .setRequired(false);

              if (
                settings.leveling.announcement_channel_id &&
                interaction.guild.channels.cache.has(settings.leveling.announcement_channel_id)
              ) {
                announcement.setDefaultChannels(settings.leveling.announcement_channel_id);
              }
              const ignoredDefaults = settings.leveling.ignored_channel_ids
                .filter((id) => interaction.guild.channels.cache.has(id))
                .slice(0, 25);
              if (ignoredDefaults.length) ignored.setDefaultChannels(...ignoredDefaults);

              await interaction.showModal(
                new ModalBuilder()
                  .setCustomId(`level-settings:channels-modal`)
                  .setTitle("Leveling channels")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("Announcement channel")
                      .setDescription("Leave empty to announce where the member leveled up.")
                      .setChannelSelectMenuComponent(announcement),
                    new LabelBuilder()
                      .setLabel("Ignored channels")
                      .setDescription("Messages in these channels will not earn XP.")
                      .setChannelSelectMenuComponent(ignored),
                  ),
              );
              break;
            }
            case "ignored-roles": {
              const roles = new RoleSelectMenuBuilder()
                .setCustomId("ignored-roles")
                .setMinValues(0)
                .setMaxValues(25)
                .setRequired(false);
              const defaults = settings.leveling.ignored_role_ids
                .filter((id) => interaction.guild.roles.cache.has(id))
                .slice(0, 25);
              if (defaults.length) roles.setDefaultRoles(...defaults);

              await interaction.showModal(
                new ModalBuilder()
                  .setCustomId(`level-settings:ignored-roles-modal`)
                  .setTitle("Ignored roles")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("Roles that cannot earn XP")
                      .setDescription("Clear every selection to allow all roles.")
                      .setRoleSelectMenuComponent(roles),
                  ),
              );
              break;
            }
            case "reward":
              await interaction.showModal(
                new ModalBuilder()
                  .setCustomId(`level-settings:reward-modal`)
                  .setTitle("Level reward")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("Level")
                      .setDescription("A whole number from 1 to 1000.")
                      .setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId("level")
                          .setStyle(TextInputStyle.Short)
                          .setValue("1")
                          .setPlaceholder("10")
                          .setRequired(true),
                      ),
                    new LabelBuilder()
                      .setLabel("Reward role")
                      .setDescription("Leave empty to remove the reward for this level.")
                      .setRoleSelectMenuComponent(
                        new RoleSelectMenuBuilder()
                          .setCustomId("reward-role")
                          .setMinValues(0)
                          .setMaxValues(1)
                          .setRequired(false),
                      ),
                  ),
              );
              break;
            default:
              throw new Error(`Unknown level settings button: ${action}`);
          }
        }

        if (interaction.isModalSubmit()) {
          switch (action) {
            case "xp-modal": {
              const minimum = Number(interaction.fields.getTextInputValue("minimum").trim());
              const maximum = Number(interaction.fields.getTextInputValue("maximum").trim());

              await db.setLevelingXpRange(interaction.guildId, minimum, maximum);
              break;
            }
            case "cooldown-modal": {
              const seconds = Number(interaction.fields.getTextInputValue("seconds").trim());

              await db.setLevelingCooldown(interaction.guildId, seconds);
              break;
            }
            case "channels-modal": {
              const announcement = interaction.fields
                .getSelectedChannels("announcement-channel")
                ?.first();
              const selectedChannels = interaction.fields.getSelectedChannels("ignored-channels");
              const ignoredChannels = selectedChannels ? [...selectedChannels.keys()] : [];

              if (announcement) {
                const permissions = announcement.permissionsFor(interaction.guild.members.me);
                if (
                  !permissions?.has([
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                  ])
                ) {
                  await interaction.reply({
                    content: "I need View Channel and Send Messages in the announcement channel.",
                    flags: MessageFlags.Ephemeral,
                  });
                  return;
                }
              }

              await db.setLevelingChannels(
                interaction.guildId,
                announcement?.id || null,
                ignoredChannels,
              );
              break;
            }
            case "ignored-roles-modal": {
              const selectedRoles = interaction.fields.getSelectedRoles("ignored-roles");
              await db.setIgnoredLevelingRoles(
                interaction.guildId,
                selectedRoles ? [...selectedRoles.keys()] : [],
              );
              break;
            }
            case "reward-modal": {
              const level = Number(interaction.fields.getTextInputValue("level").trim());
              const role = interaction.fields.getSelectedRoles("reward-role")?.first();
              if (!Number.isInteger(level) || level < 1 || level > 1_000) {
                await interaction.reply({
                  content: "Level must be a whole number from 1 to 1000.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }
              if (role && !role.editable) {
                await interaction.reply({
                  content:
                    "I cannot grant that role. Put my bot role above it and give me Manage Roles.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }
              await db.setLevelingRewardRole(interaction.guildId, level, role?.id || null);
              break;
            }
            default:
              throw new Error(`Unknown level settings modal: ${action}`);
          }

          const updated = await db.getSettings(interaction.guildId);
          await interaction.update(levelSettingsCommand.panelResponse(updated.leveling));
        }
      } catch (error) {
        await replyWithError(interaction, error);
      }
      return;
    }

    if (interaction.customId?.startsWith("bubble:user:")) {
      const customIdParts = interaction.customId.split(":");
      const action = customIdParts[2];
      const bubbleOwnerId = action === "info-update"
        ? customIdParts[3]
        : interaction.user.id;

      const bubble = await db.getBubble(interaction.guildId, null, bubbleOwnerId);

      if (!bubble) {
        await interaction.reply({
          content: action === "info-update"
            ? "This bubble no longer exists."
            : "You don't own a bubble anymore. Please recreate one.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const settings = await db.getSettings(interaction.guildId);
      const channelId = bubble.channel_id ? String(bubble.channel_id) : null;
      const channel = channelId
        ? interaction.guild.channels.cache.get(channelId) ||
          (await interaction.guild.channels.fetch(channelId).catch(() => null))
        : null;

      if (channelId && !channel) {
        await db.clearBubbleChannel(interaction.guildId, channelId);
      }
      const userLimit = channel?.userLimit ?? bubble.user_limit ?? 0;

      if (interaction.isButton()) {
        try {
          switch (action) {
            case "info":
            case "info-update": {
              const components = interaction.client.modules.bubbleInfo(
                bubble,
                settings,
                channel,
              );

              if (action === "info-update") {
                await interaction.update({
                  components,
                  allowedMentions: { parse: [] },
                });
              } else {
                await interaction.reply({
                  components,
                  flags: MessageFlags.IsComponentsV2,
                  allowedMentions: { parse: [] },
                });
              }
              break;
            }
            case "trusted": {
              const trustedUsers = new UserSelectMenuBuilder()
                .setCustomId("trusted-users")
                .setMinValues(0)
                .setMaxValues(25)
                .setRequired(false);
              if (bubble.trusted_user_ids?.length) {
                const defaults = bubble.trusted_user_ids.filter((userId) =>
                  interaction.guild.members.cache.has(userId));
                if (defaults.length) trustedUsers.setDefaultUsers(...defaults);
              }
              await interaction.showModal(
                new ModalBuilder()
                  .setTitle("Manage trusted users")
                  .setCustomId("bubble:user:trusted")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("Trusted users")
                      .setDescription("Trusted users can see and join locked or hidden bubbles.")
                      .setUserSelectMenuComponent(trustedUsers),
                  ),
              );
              break;
            }
            case "banned": {
              const bannedUsers = new UserSelectMenuBuilder()
                .setCustomId("banned-users")
                .setMinValues(0)
                .setMaxValues(25)
                .setRequired(false);
              if (bubble.banned_user_ids?.length) {
                const defaults = bubble.banned_user_ids.filter((userId) =>
                  interaction.guild.members.cache.has(userId));
                if (defaults.length) bannedUsers.setDefaultUsers(...defaults);
              }
              await interaction.showModal(
                new ModalBuilder()
                  .setTitle("Manage banned users")
                  .setCustomId("bubble:user:banned")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("Banned users")
                      .setDescription("Banned users cannot see or join your bubble.")
                      .setUserSelectMenuComponent(bannedUsers),
                  ),
              );
              break;
            }
            case "kick": {
              await interaction.showModal(
                new ModalBuilder()
                  .setTitle("Kick user")
                  .setCustomId("bubble:user:kick")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("User to disconnect")
                      .setUserSelectMenuComponent(
                        new UserSelectMenuBuilder()
                          .setCustomId("kick-user")
                          .setMinValues(1)
                          .setMaxValues(1)
                          .setRequired(true),
                      ),
                  ),
              );
              break;
            }
            case "rename": {
              await interaction.showModal(
                new ModalBuilder()
                  .setTitle("Modal")
                  .setCustomId("bubble:user:rename")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("New name?")
                      .setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId("new-name")
                          .setStyle(TextInputStyle.Short)
                          .setValue(`${bubble.name}`)
                          .setMaxLength(100),
                      ),
                  ),
              );
              break;
            }
            case "limit": {
              await interaction.showModal(
                new ModalBuilder()
                  .setTitle("Bubble user limit")
                  .setCustomId("bubble:user:limit")
                  .addLabelComponents(
                    new LabelBuilder()
                      .setLabel("New user limit")
                      .setDescription("Enter 0 for unlimited, or a number from 1 to 99.")
                      .setTextInputComponent(
                        new TextInputBuilder()
                          .setCustomId("limit")
                          .setStyle(TextInputStyle.Short)
                          .setValue(`${userLimit}`)
                          .setRequired(true)
                          .setMaxLength(2),
                      ),
                  ),
              );
              break;
            }
            case "togglelock": {
              await interaction.deferUpdate();
              const updatedLocked = !bubble.locked;
              await db.setBubbleLocked(interaction.guildId, interaction.user.id, updatedLocked);

              if (channel) {
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                  Connect: updatedLocked ? false : null,
                });
                await channel.permissionOverwrites.edit(interaction.user.id, {
                  Connect: updatedLocked ? true : null,
                });
              }

              const components =
                await interaction.client.modules.bubbleControlPanel.bubbleControlPanel(interaction);

              await interaction.editReply({
                components,
                allowedMentions: { parse: [] },
              });
              break;
            }
            case "togglevisibility": {
              await interaction.deferUpdate();
              const updatedHidden = !bubble.hidden;
              await db.setBubbleHidden(interaction.guildId, interaction.user.id, updatedHidden);

              if (channel) {
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                  ViewChannel: updatedHidden ? false : null,
                });
                await channel.permissionOverwrites.edit(interaction.user.id, {
                  ViewChannel: updatedHidden ? true : null,
                });
              }

              const components =
                await interaction.client.modules.bubbleControlPanel.bubbleControlPanel(interaction);

              await interaction.editReply({
                components,
                allowedMentions: { parse: [] },
              });
              break;
            }
            case "toggleanchor": {
              const updatedAnchored = !bubble.anchored;
              if (updatedAnchored) {
                const anchoredLimit = settings.bubble.anchored_channel_limit;
                const anchoredBubbles = await db.getAnchoredBubbles(interaction.guildId);
                if (!anchoredLimit || anchoredBubbles.length >= anchoredLimit) {
                  await interaction.reply({
                    content: anchoredLimit
                      ? "This server has no Anchor slots available. Please wait until someone unanchors their bubble."
                      : "Anchoring is disabled on this server.",
                    flags: MessageFlags.Ephemeral,
                  });
                  return;
                }
              }

              await interaction.deferUpdate();
              await db.setBubbleAnchored(interaction.guildId, interaction.user.id, updatedAnchored);

              if (channel && channel.members.size === 0) {
                if (updatedAnchored) {
                  const hub = settings.bubble.hub_channel_id
                    ? interaction.guild.channels.cache.get(settings.bubble.hub_channel_id) ||
                      (await interaction.guild.channels
                        .fetch(settings.bubble.hub_channel_id)
                        .catch(() => null))
                    : null;
                  await channel.setParent(hub?.parent || null, { lockPermissions: true });
                  await db.setBubbleInactiveSince(interaction.guildId, interaction.user.id, null);
                } else {
                  const inactiveCategory = settings.bubble.inactive_category_id
                    ? interaction.guild.channels.cache.get(settings.bubble.inactive_category_id) ||
                      (await interaction.guild.channels
                        .fetch(settings.bubble.inactive_category_id)
                        .catch(() => null))
                    : null;
                  if (inactiveCategory?.type === ChannelType.GuildCategory) {
                    await channel.setParent(inactiveCategory, { lockPermissions: true });
                    await db.setBubbleInactiveSince(
                      interaction.guildId,
                      interaction.user.id,
                      new Date(),
                    );
                    await interaction.client.modules.enforceInactiveBubbleLimit(
                      interaction.client,
                      interaction.guild,
                      settings.bubble.inactive_channel_limit,
                    );
                  } else {
                    await channel.delete("Empty unanchored bubble channel");
                    await db.clearBubbleChannel(interaction.guildId, channel.id);
                  }
                }
              }

              const components =
                await interaction.client.modules.bubbleControlPanel.bubbleControlPanel(interaction);
              await interaction.editReply({ components, allowedMentions: { parse: [] } });
              break;
            }
            case "pop": {
              const components = [
                new ContainerBuilder()
                  .setAccentColor(16746375)
                  .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                      `## Are you sure you want to pop this bubble?\n**${bubble.name}** and it's channel will be *permanently* deleted`,
                    ),
                  )
                  .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                      new ButtonBuilder()
                        .setStyle(ButtonStyle.Danger)
                        .setLabel("Confirm")
                        .setCustomId("bubble:user:pop-confirm"),
                    ),
                  ),
              ];
              await interaction.reply({
                components,
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
              });
              break;
            }
            case "pop-confirm": {
              const components = [
                new ContainerBuilder()
                  .setAccentColor(16746375)
                  .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent("## Popping bubble..."),
                  ),
              ];
              await interaction.deferUpdate();
              await interaction.editReply({
                components,
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
              });
              await db.removeBubble(interaction.guildId, interaction.user.id);
              if (channel) {
                try {
                  await channel.delete("Popped bubble");
                } catch (error) {
                  await interaction.editReply({
                    content:
                      "I couldn't delete the bubble channel. Please check my permissions and try again.",
                    flags: MessageFlags.Ephemeral,
                  });
                }
              }
            }
          }
        } catch (error) {
          await replyWithError(interaction, error);
        }
      }
      if (interaction.isModalSubmit()) {
        const action = interaction.customId.split(":")[2];
        try {
          switch (action) {
            case "rename": {
              await interaction.deferUpdate();

              const name = interaction.fields.getTextInputValue("new-name");

              await db.setBubbleName(interaction.guildId, interaction.user.id, name);

              if (channel) {
                const channelName = interaction.client.modules.bubbleChannelName(
                  settings.bubble.channel_prefix,
                  name,
                );
                if (channel.name !== channelName) {
                  await channel.setName(channelName, "Bubble renamed by owner");
                }
              }

              const components =
                await interaction.client.modules.bubbleControlPanel.bubbleControlPanel(interaction);

              await interaction.editReply({
                components,
                allowedMentions: { parse: [] },
              });
              break;
            }
            case "limit": {
              const userLimitInput = interaction.fields.getTextInputValue("limit").trim();
              const updatedUserLimit = Number(userLimitInput);

              if (
                !/^\d+$/.test(userLimitInput) ||
                !Number.isInteger(updatedUserLimit) ||
                updatedUserLimit < 0 ||
                updatedUserLimit > 99
              ) {
                await interaction.reply({
                  content: "User limit must be a whole number from 0 to 99.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              await interaction.deferUpdate();
              await db.setBubbleUserLimit(
                interaction.guildId,
                interaction.user.id,
                updatedUserLimit,
              );

              if (channel) {
                await channel.setUserLimit(updatedUserLimit);
              }

              const components =
                await interaction.client.modules.bubbleControlPanel.bubbleControlPanel(interaction);

              await interaction.editReply({
                components,
                allowedMentions: { parse: [] },
              });
              break;
            }
            case "trusted": {
              const selectedUsers = interaction.fields.getSelectedUsers("trusted-users");
              const trustedUserIds = selectedUsers
                ? [...selectedUsers.values()]
                    .filter((user) => !user.bot && user.id !== interaction.user.id)
                    .map((user) => user.id)
                : [];
              const previousUserIds = [
                ...(bubble.trusted_user_ids || []),
                ...(bubble.banned_user_ids || []),
              ];

              await interaction.deferUpdate();
              await db.setBubbleTrustedUsers(
                interaction.guildId,
                interaction.user.id,
                trustedUserIds,
              );
              const updatedBubble = await db.getBubble(
                interaction.guildId,
                null,
                interaction.user.id,
              );
              if (channel) {
                await interaction.client.modules.applyBubblePermissions(
                  channel,
                  updatedBubble,
                  previousUserIds,
                );
              }

              const components =
                await interaction.client.modules.bubbleControlPanel.bubbleControlPanel(interaction);
              await interaction.editReply({ components, allowedMentions: { parse: [] } });
              break;
            }
            case "banned": {
              const selectedUsers = interaction.fields.getSelectedUsers("banned-users");
              const bannedUserIds = selectedUsers
                ? [...selectedUsers.values()]
                    .filter((user) => !user.bot && user.id !== interaction.user.id)
                    .map((user) => user.id)
                : [];
              const previousUserIds = [
                ...(bubble.trusted_user_ids || []),
                ...(bubble.banned_user_ids || []),
              ];

              await interaction.deferUpdate();
              await db.setBubbleBannedUsers(
                interaction.guildId,
                interaction.user.id,
                bannedUserIds,
              );
              const updatedBubble = await db.getBubble(
                interaction.guildId,
                null,
                interaction.user.id,
              );
              if (channel) {
                await interaction.client.modules.applyBubblePermissions(
                  channel,
                  updatedBubble,
                  previousUserIds,
                );
                for (const userId of bannedUserIds) {
                  const bannedMember = interaction.guild.members.cache.get(userId);
                  if (bannedMember?.voice.channelId === channel.id) {
                    await bannedMember.voice.disconnect("Banned by bubble owner");
                  }
                }
              }

              const components =
                await interaction.client.modules.bubbleControlPanel.bubbleControlPanel(interaction);
              await interaction.editReply({ components, allowedMentions: { parse: [] } });
              break;
            }
            case "kick": {
              const selectedUser = interaction.fields.getSelectedUsers("kick-user", true).first();
              const member = await interaction.guild.members
                .fetch(selectedUser.id)
                .catch(() => null);
              if (!channel || !member || member.voice.channelId !== channel.id) {
                await interaction.reply({
                  content: "That user is not connected to your bubble.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }
              if (member.id === interaction.user.id) {
                await interaction.reply({
                  content: "You cannot kick yourself from your bubble.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              await interaction.deferUpdate();
              await member.voice.disconnect("Kicked by bubble owner");
              const components =
                await interaction.client.modules.bubbleControlPanel.bubbleControlPanel(interaction);
              await interaction.editReply({ components, allowedMentions: { parse: [] } });
              break;
            }
          }
        } catch (error) {
          await replyWithError(interaction, error);
        }
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error("Failed to provide autocomplete choices:", error);
        }
      }
      return;
    }

    if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        await replyWithError(interaction, error);
      }
    }
  },
};
