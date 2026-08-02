const {
  ChannelSelectMenuBuilder,
  ChannelType,
  Events,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { issuesUrl } = require("#config");

const LEVEL_SETTINGS_PREFIX = "level-settings:";

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

async function validationError(interaction, message) {
  await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
}

function parseInteger(interaction, field) {
  const value = Number(interaction.fields.getTextInputValue(field).trim());
  return Number.isInteger(value) ? value : null;
}

async function refreshLevelSettings(interaction, command) {
  const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
  await interaction.update(command.panelResponse(settings.leveling));
}

async function handleLevelSettingsButton(interaction) {
  const command = interaction.client.commands.get("level-settings");
  const action = interaction.customId.slice(LEVEL_SETTINGS_PREFIX.length);
  const settings = await interaction.client.modules.db.getSettings(interaction.guildId);

  switch (action) {
    case "toggle":
      await interaction.client.modules.db.setLevelingEnabled(
        interaction.guildId,
        !settings.leveling.enabled,
      );
      await refreshLevelSettings(interaction, command);
      return;
    case "xp":
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`${LEVEL_SETTINGS_PREFIX}xp-modal`)
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
      return;
    case "cooldown":
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`${LEVEL_SETTINGS_PREFIX}cooldown-modal`)
          .setTitle("XP cooldown")
          .addLabelComponents(
            new LabelBuilder()
              .setLabel("Cooldown in seconds")
              .setDescription("A whole number from 10 to 3600.")
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
      return;
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
        && interaction.guild.channels.cache.has(settings.leveling.announcement_channel_id)
      ) {
        announcement.setDefaultChannels(settings.leveling.announcement_channel_id);
      }
      const ignoredDefaults = settings.leveling.ignored_channel_ids
        .filter((id) => interaction.guild.channels.cache.has(id))
        .slice(0, 25);
      if (ignoredDefaults.length) ignored.setDefaultChannels(...ignoredDefaults);

      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`${LEVEL_SETTINGS_PREFIX}channels-modal`)
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
      return;
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
          .setCustomId(`${LEVEL_SETTINGS_PREFIX}ignored-roles-modal`)
          .setTitle("Ignored roles")
          .addLabelComponents(
            new LabelBuilder()
              .setLabel("Roles that cannot earn XP")
              .setDescription("Clear every selection to allow all roles.")
              .setRoleSelectMenuComponent(roles),
          ),
      );
      return;
    }
    case "reward":
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`${LEVEL_SETTINGS_PREFIX}reward-modal`)
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
      return;
    default:
      throw new Error(`Unknown level settings button: ${action}`);
  }
}

async function handleLevelSettingsModal(interaction) {
  const command = interaction.client.commands.get("level-settings");
  const action = interaction.customId.slice(LEVEL_SETTINGS_PREFIX.length);
  const db = interaction.client.modules.db;

  switch (action) {
    case "xp-modal": {
      const minimum = parseInteger(interaction, "minimum");
      const maximum = parseInteger(interaction, "maximum");
      if (minimum === null || maximum === null || minimum < 1 || maximum > 100 || maximum < minimum) {
        await validationError(interaction, "Use whole numbers from 1 to 100, with maximum at least minimum.");
        return;
      }
      await db.setLevelingXpRange(interaction.guildId, minimum, maximum);
      break;
    }
    case "cooldown-modal": {
      const seconds = parseInteger(interaction, "seconds");
      if (seconds === null || seconds < 10 || seconds > 3_600) {
        await validationError(interaction, "Cooldown must be a whole number from 10 to 3600 seconds.");
        return;
      }
      await db.setLevelingCooldown(interaction.guildId, seconds);
      break;
    }
    case "channels-modal": {
      const announcement = interaction.fields
        .getSelectedChannels("announcement-channel")
        ?.first();
      const ignoredChannels = interaction.fields.getSelectedChannels("ignored-channels");
      const ignored = ignoredChannels ? [...ignoredChannels.keys()] : [];

      if (announcement) {
        const permissions = announcement.permissionsFor(interaction.guild.members.me);
        if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
          await validationError(interaction, "I need View Channel and Send Messages in the announcement channel.");
          return;
        }
      }

      await db.setLevelingChannels(interaction.guildId, announcement?.id || null, ignored);
      break;
    }
    case "ignored-roles-modal": {
      const selectedRoles = interaction.fields.getSelectedRoles("ignored-roles");
      const roles = selectedRoles ? [...selectedRoles.keys()] : [];
      await db.setIgnoredLevelingRoles(interaction.guildId, roles);
      break;
    }
    case "reward-modal": {
      const level = parseInteger(interaction, "level");
      const role = interaction.fields.getSelectedRoles("reward-role")?.first();
      if (level === null || level < 1 || level > 1_000) {
        await validationError(interaction, "Level must be a whole number from 1 to 1000.");
        return;
      }
      if (role && !role.editable) {
        await validationError(interaction, "I cannot grant that role. Put my bot role above it and give me Manage Roles.");
        return;
      }
      await db.setLevelingRewardRole(interaction.guildId, level, role?.id || null);
      break;
    }
    default:
      throw new Error(`Unknown level settings modal: ${action}`);
  }

  await refreshLevelSettings(interaction, command);
}

function canManageLevelSettings(interaction) {
  return interaction.inGuild()
    && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (interaction.isButton() && interaction.customId.startsWith(LEVEL_SETTINGS_PREFIX)) {
      try {
        if (!canManageLevelSettings(interaction)) {
          await validationError(interaction, "You need Manage Server to change leveling settings.");
          return;
        }
        await handleLevelSettingsButton(interaction);
      } catch (error) {
        await replyWithError(interaction, error);
      }
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith(LEVEL_SETTINGS_PREFIX)) {
      try {
        if (!canManageLevelSettings(interaction)) {
          await validationError(interaction, "You need Manage Server to change leveling settings.");
          return;
        }
        await handleLevelSettingsModal(interaction);
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
