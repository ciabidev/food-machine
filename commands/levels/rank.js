const {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandSubcommandBuilder,
} = require("discord.js");

const { getLevelFromXp, getXpForLevel } = require("#modules/leveling");
const { buildRankCard } = require("#modules/rankCard");

module.exports = {
  data: new SlashCommandSubcommandBuilder()
    .setName("rank")
    .setDescription("Show the level and rank of yourself or another user.")
    .addUserOption((option) => option
      .setName("user")
      .setDescription("The user to show.")
      .setRequired(false)),

  async execute(interaction) {
    const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
    const levelingSettings = settings.leveling;

    if (!levelingSettings.enabled) {
      await interaction.reply({
        content: "Leveling is not enabled on this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const user = interaction.options.getUser("user") ?? interaction.user;
    const profile = await interaction.client.modules.db.getLevelProfile(
      interaction.guildId,
      user.id,
    );

    if (!profile) {
      await interaction.reply({
        content: "You have not earned any XP yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const level = getLevelFromXp(profile.xp);
    const levelStartXp = getXpForLevel(level);
    const nextLevelXp = getXpForLevel(level + 1);
    const rank = await interaction.client.modules.db.getLevelRank(
      interaction.guildId,
      profile.xp,
    );
    const selectedMember = interaction.options.getMember("user");
    const member = selectedMember ?? (user.id === interaction.user.id ? interaction.member : null);
    const card = await buildRankCard({
      user,
      member,
      currentXp: profile.xp - levelStartXp,
      requiredXp: nextLevelXp - levelStartXp,
      level,
      rank,
    });

    await interaction.editReply({
      files: [new AttachmentBuilder(card, { name: "rank.png" })],
    });
  },
};
