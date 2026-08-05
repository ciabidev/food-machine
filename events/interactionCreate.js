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
} = require("discord.js");
const { issuesUrl } = require("#config");

const LEVEL_SETTINGS_PREFIX = "level-settings:";
const WELCOME_SETTINGS_PREFIX = "welcome-settings:";
const BUBBLE_SETTINGS_MODAL_ID = "bubble-settings:modal";
const POP_BUBBLE_ACCENT_COLOR = 0xF87171;

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

    if (interaction.customId === "pop-bubbles") {
      try {
        if (
          !interaction.inGuild()
          || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
          await interaction.reply({
            content: "You need Manage Server to pop bubble channels.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!interaction.isModalSubmit()) return;

        const db = interaction.client.modules.db;
        const selectedChannelIds = interaction.fields.getStringSelectValues(
          "pop-bubble-channels",
        );
        const reason = interaction.fields
          .getTextInputValue("pop-bubbles-reason")
          .trim();

        if (!reason) {
          await interaction.reply({
            content: "A reason is required to pop bubble channels.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const bubbleRecords = await db.getBubbles(interaction.guildId);
        const bubbles = bubbleRecords.map((bubble) => {
          const storedChannelId = Array.isArray(bubble.channel_id)
            ? bubble.channel_id[0]
            : bubble.channel_id;
          const channelId = String(storedChannelId).match(/^<#(\d+)>$/)?.[1]
            || String(storedChannelId);
          return { record: bubble, channelId };
        });
        const bubblesToDelete = selectedChannelIds.length
          ? bubbles.filter((bubble) => selectedChannelIds.includes(bubble.channelId))
          : bubbles;
        let deletedCount = 0;
        let failedCount = 0;
        let notificationFailedCount = 0;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        for (const bubble of bubblesToDelete) {
          const channel = await interaction.guild.channels
            .fetch(bubble.channelId)
            .catch(() => null);

          if (channel && !await channel.delete(`Bubble popped by ${interaction.user.tag}: ${reason}`).catch(() => null)) {
            failedCount += 1;
            continue;
          }

          deletedCount += 1;
          const bubbleName = bubble.record.name || channel?.name || "Your bubble";
          const bubbleHost = await interaction.client.users
            .fetch(String(bubble.record.host_id))
            .catch(() => null);

          if (
            !bubbleHost
            || !await bubbleHost.send({
              components: [
                new ContainerBuilder()
                  .setAccentColor(POP_BUBBLE_ACCENT_COLOR)
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
            }).then(() => true).catch(() => false)
          ) {
            notificationFailedCount += 1;
          }

          await db.removeBubble(interaction.guildId, bubble.channelId);
        }

        const result = [
          `Popped ${deletedCount} bubble channel(s).`,
          `**Reason:** ${reason}`,
        ];
        if (failedCount) result.push(`-# Failed to delete ${failedCount}.`);
        if (notificationFailedCount) {
          result.push(`Could not notify ${notificationFailedCount} host(s).`);
        }

        await interaction.editReply({
          components: [
            new ContainerBuilder()
              .setAccentColor(POP_BUBBLE_ACCENT_COLOR)
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
      return;
    }

    if (interaction.customId === BUBBLE_SETTINGS_MODAL_ID) {
      try {
        if (
          !interaction.inGuild()
          || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
          await interaction.reply({
            content: "You need Manage Server to change bubble settings.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!interaction.isModalSubmit()) return;

        const hub = interaction.fields
          .getSelectedChannels("bubble-hub-channel")
          ?.first();
        const inactiveCategory = interaction.fields
          .getSelectedChannels("bubble-inactive-category")
          ?.first();

        await interaction.client.modules.db.setBubbleHub(
          interaction.guildId,
          hub?.id || null,
        );
        await interaction.client.modules.db.setBubbleInactiveCategory(
          interaction.guildId,
          inactiveCategory?.id || null,
        );

        await interaction.reply({
          content: [
            "🫧 **Bubble settings saved**",
            `Creation hub: ${hub || "Disabled"}`,
            `Inactive category: ${inactiveCategory || "Not set"}`,
          ].join("\n"),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        await replyWithError(interaction, error);
      }
      return;
    }

    if (interaction.customId?.startsWith(WELCOME_SETTINGS_PREFIX)) {
      try {
        if (
          !interaction.inGuild()
          || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
          await interaction.reply({
            content: "You need Manage Server to change the welcome channels.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!interaction.isModalSubmit()) return;

        const selectedChannels = interaction.fields.getSelectedChannels("welcome-settings:channels");
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
      return;
    }

    if (interaction.customId?.startsWith(LEVEL_SETTINGS_PREFIX)) {
      try {
        if (
          !interaction.inGuild()
          || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
          await interaction.reply({
            content: "You need Manage Server to change leveling settings.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const [, action] = interaction.customId.split(":");
        const db = interaction.client.modules.db;
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
                settings.leveling.announcement_channel_id
                && interaction.guild.channels.cache.has(
                  settings.leveling.announcement_channel_id,
                )
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
              const minimum = Number(
                interaction.fields.getTextInputValue("minimum").trim(),
              );
              const maximum = Number(
                interaction.fields.getTextInputValue("maximum").trim(),
              );

              await db.setLevelingXpRange(interaction.guildId, minimum, maximum);
              break;
            }
            case "cooldown-modal": {
              const seconds = Number(
                interaction.fields.getTextInputValue("seconds").trim(),
              );

              await db.setLevelingCooldown(interaction.guildId, seconds);
              break;
            }
            case "channels-modal": {
              const announcement = interaction.fields
                .getSelectedChannels("announcement-channel")
                ?.first();
              const selectedChannels = interaction.fields
                .getSelectedChannels("ignored-channels");
              const ignoredChannels = selectedChannels
                ? [...selectedChannels.keys()]
                : [];

              if (announcement) {
                const permissions = announcement.permissionsFor(
                  interaction.guild.members.me,
                );
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
              const level = Number(
                interaction.fields.getTextInputValue("level").trim(),
              );
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
                  content: "I cannot grant that role. Put my bot role above it and give me Manage Roles.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }
              await db.setLevelingRewardRole(
                interaction.guildId,
                level,
                role?.id || null,
              );
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

    if (interaction.isAutocomplete()) {
      if (!command?.autocomplete) return;
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error("Failed to provide autocomplete choices:", error);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      await replyWithError(interaction, error);
    }
  },
};
