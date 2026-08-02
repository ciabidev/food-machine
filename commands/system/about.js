const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require("discord.js");

const formatMilliseconds = require("#modules/formatMilliseconds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("about")
    .setDescription("View information and statistics about the bot."),

  async execute(interaction) {
    const client = interaction.client;
    const botUser = await client.users.fetch(client.user.id, { force: true });
    const avatarUrl = botUser.displayAvatarURL({ extension: "png", size: 1024 });
    const bannerUrl = botUser.bannerURL({ extension: "png", size: 4096 }) ?? avatarUrl;
    const uptime = formatMilliseconds(client.uptime);
    const memory = `${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`;

    const components = [
      new ContainerBuilder()
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl)),
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
        )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `### food machine\n-# economy • leveling • user utility • fun | developed by [Ciabi](https://github.com/ciabidev)`,
              ),
            )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `> -# Commands » \`${client.commands.size}\``,
              `> -# Latency » \`${client.ws.ping} ms\``,
              `> -# Uptime » \`${uptime}\``,
              `> -# Memory » \`${memory}\``,
            ].join("\n"),
          ),
        ),
    ];

    await interaction.reply({
      components,
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
