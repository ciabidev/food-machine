const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("run that back")
    .addIntegerOption((option) =>
      option
        .setName("index")
        .setDescription("how many messages should i go back?")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false),
    ),
  async execute(interaction) {
    const snipesHere = interaction.client.snipes.get(interaction.channelId) ?? [];
    const index = interaction.options.getInteger("index") ?? 1;
    const targetMessage = snipesHere.at(-index);

    if (!targetMessage) {
      await interaction.reply({
        content: "no message found",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetUser = targetMessage.author;
    const avatarUrl = targetUser.displayAvatarURL({ extension: "png", size: 1024 });
    const unixTimestamp = Math.floor(targetMessage.deletedAt / 1000);

    const snipeEmbed = new EmbedBuilder()
      .setColor(0xf38ba8)
      .setAuthor({ name: targetUser.tag, iconURL: avatarUrl })
      .setDescription(`${targetMessage.content || "*No message content.*"}\n-# deleted <t:${unixTimestamp}:R>`)
      .setFooter({ text: `index: ${index}` });
    console.log(targetUser)
    await interaction.reply({
      content: `sniped message from ${targetUser}`,
      embeds: [snipeEmbed],
      files: targetMessage.attachments.map((attachment) => ({
        attachment: attachment.url,
        name: attachment.name,
      })),
      allowedMentions: { parse: ['users'] },
    });
  },
};
