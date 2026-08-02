const { awardMessageXp } = require("#modules/db");
const { AttachmentBuilder } = require("discord.js");
const { buildRankCard } = require("#modules/rankCard");

const xpCooldowns = new Set();
const XP_BASE = 100;

function getLevelFromXp(xp) {
  return Math.floor(Math.sqrt(xp / XP_BASE));
}

function getXpForLevel(level) {
  return XP_BASE * level ** 2;
}


async function sendLevelUpMessage(message, level, totalXp, levelingSettings) {
  const levelStartXp = getXpForLevel(level);
  const nextLevelXp = getXpForLevel(level + 1);
  const rank = await message.client.modules.db.getLevelRank(message.guild.id, totalXp);
  const card = await buildRankCard({
    user: message.author,
    member: message.member,
    currentXp: totalXp - levelStartXp,
    requiredXp: nextLevelXp - levelStartXp,
    level,
    rank,
  });

  let announcementChannel = message.channel;
  if (levelingSettings.announcement_channel_id) {
    announcementChannel = message.guild.channels.cache.get(
      levelingSettings.announcement_channel_id,
    ) ?? message.channel;
  }

  return announcementChannel.send({
    content: `🎊 <@${message.author.id}> just reached level **${level}**!`,
    files: [new AttachmentBuilder(card, { name: "rank.png" })],
    allowedMentions: { users: [message.author.id] },
  });
}

async function handleMessage(message) {
  const settings = await message.client.modules.db.getSettings(message.guild.id);
  const levelingSettings = settings.leveling;

  if (!message.inGuild() || message.author.bot) return;
  if (message.channel.id in levelingSettings.ignored_channel_ids) return;
  if (message.member.roles.cache.has(levelingSettings.ignored_role_ids)) return;
  if (!levelingSettings.enabled) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const cooldownKey = `${guildId}:${userId}`;

    if (xpCooldowns.has(cooldownKey)) return;

  xpCooldowns.add(cooldownKey);

  try {
    const xpDelta = Math.floor(Math.random() * (levelingSettings.xp_max - levelingSettings.xp_min + 1)) + levelingSettings.xp_min;
    const profile = await awardMessageXp(guildId, userId, xpDelta);

    console.log(`Awarded ${xpDelta} XP to ${profile.user_id}`);

    const previousLevel = getLevelFromXp(profile.xp - xpDelta);
    const currentLevel = getLevelFromXp(profile.xp);

    if (currentLevel > previousLevel) {
      if (currentLevel in levelingSettings.reward_role_ids) {
        const roleId = levelingSettings.reward_role_ids[currentLevel];
        const role = message.guild.roles.cache.get(roleId);
        if (role) await message.member.roles.add(role);
      }
      await sendLevelUpMessage(message, currentLevel, profile.xp, levelingSettings);

    }
  } catch (error) {
    xpCooldowns.delete(cooldownKey);
    throw error;
  }

  setTimeout(() => xpCooldowns.delete(cooldownKey), levelingSettings.cooldown_seconds * 1000);
}

module.exports = { handleMessage, sendLevelUpMessage, getLevelFromXp, getXpForLevel };
