const { Font, RankCardBuilder } = require("canvacord");

Font.loadDefault();

async function buildRankCard({ user, member, currentXp, requiredXp, level, rank }) {
  return new RankCardBuilder()
    .setDisplayName(member?.displayName ?? user.globalName ?? user.username)
    .setUsername(user.username)
    .setAvatar(user.displayAvatarURL({ extension: "png", size: 256 }))
    .setCurrentXP(currentXp)
    .setRequiredXP(requiredXp)
    .setLevel(level)
    .setRank(rank)
    .build({ format: "png" });
}

module.exports = { buildRankCard };
