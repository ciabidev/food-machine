const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
  TextDisplayBuilder,
} = require("discord.js");

const COLORS_PER_ROW = 5;
const ROWS_PER_PAGE = 8;
const COLORS_PER_PAGE = COLORS_PER_ROW * ROWS_PER_PAGE;
const pickerUpdateQueues = new Map();

async function buildColorPickerPage(client, colors, requestedPage) {
  if (!colors.length) {
    return {
      content: null,
      components: [
        new ContainerBuilder()
          .setAccentColor(0x5865f2)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              "## 🎨 Palette\nThere are currently no colors available.",
            ),
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    };
  }

  const sortedColors = client.modules.colorPalette.sortColors(colors);
  const pageCount = Math.ceil(sortedColors.length / COLORS_PER_PAGE);
  const page = Math.min(Math.max(requestedPage, 0), pageCount - 1);
  const pageColors = sortedColors.slice(page * COLORS_PER_PAGE, (page + 1) * COLORS_PER_PAGE);
  const rows = [];

  for (let index = 0; index < pageColors.length; index += COLORS_PER_ROW) {
    rows.push(pageColors.slice(index, index + COLORS_PER_ROW));
  }

  const images = await Promise.all(
    rows.map((row) => client.modules.colorPalette.renderColorPaletteRow(row)),
  );
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## **Use the** `Select` **button to choose a name color!**",
          `You can also use \`/color set\` to choose a color`,
          `-# Page ${page + 1} of ${pageCount} · Your color may be overridden by higher-tier roles.`,
        ].join("\n"),
      ),
    );
  const files = [];

  for (let index = 0; index < images.length; index += 1) {
    const name = `palette-${page + 1}-${index + 1}.png`;
    files.push(new AttachmentBuilder(images[index], { name }));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${name}`)
          .setDescription(`Palette colors ${page * COLORS_PER_PAGE + index * COLORS_PER_ROW + 1}–${page * COLORS_PER_PAGE + index * COLORS_PER_ROW + rows[index].length}`),
      ),
    );
  }

  const buttons = [];
  if (pageCount > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`color:picker:page:${Math.max(page - 1, 0)}`)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId("color:picker:select")
      .setLabel("Select...")
      .setStyle(ButtonStyle.Primary),
  );
  if (pageCount > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`color:picker:page:${Math.min(page + 1, pageCount - 1)}`)
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === pageCount - 1),
    );
  }

  return {
    content: null,
    components: [container, new ActionRowBuilder().addComponents(buttons)],
    files,
    flags: MessageFlags.IsComponentsV2,
  };
}

function updateStoredColorPicker(client, guildId) {
  const normalizedGuildId = String(guildId);
  const previousUpdate = pickerUpdateQueues.get(normalizedGuildId) || Promise.resolve();
  const update = previousUpdate
    .catch(() => null)
    .then(async () => {
      const settings = await client.modules.db.getSettings(normalizedGuildId);
      const channelId = settings.color.picker_channel_id;
      const messageId = settings.color.picker_message_id;
      if (!channelId || !messageId) return;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      const message = channel?.isTextBased()
        ? await channel.messages.fetch(messageId).catch(() => null)
        : null;
      if (!message) {
        await client.modules.db.setColorPickerMessage(normalizedGuildId, null, null);
        return "missing";
      }

      const colors = await client.modules.db.getColors(normalizedGuildId);
      const page = await buildColorPickerPage(client, colors, 0);
      page.attachments = [];
      await message.edit(page);
    });
  pickerUpdateQueues.set(normalizedGuildId, update);
  return update.finally(() => {
    if (pickerUpdateQueues.get(normalizedGuildId) === update) {
      pickerUpdateQueues.delete(normalizedGuildId);
    }
  });
}

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("picker")
    .setDescription("[Admin] Send the color picker"),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: "You need Manage Roles to send the color picker.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const colors = await interaction.client.modules.db.getColors(interaction.guildId);
    if (!colors.length) {
      await interaction.reply({
        content: "Add at least one color with `/color add` first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();
    const message = await interaction.editReply(
      await buildColorPickerPage(interaction.client, colors, 0),
    );
    await interaction.client.modules.db.setColorPickerMessage(
      interaction.guildId,
      message.channelId,
      message.id,
    );
  },
  buildColorPickerPage,
  updateStoredColorPicker,
};
