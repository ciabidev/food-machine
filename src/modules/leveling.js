const { awardMessageXp } = require("#modules/db");
const {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require("discord.js");

const xpCooldowns = new Set();
const XP_BASE = 100;

function getLevelFromXp(xp) {
  return Math.floor(Math.sqrt(xp / XP_BASE));
}

function getXpForLevel(level) {
  return XP_BASE * level ** 2;
}

async function sendLevelUpMessage(message, level, totalXp) {
  const settings = await message.client.modules.db.getSettings(message.guild.id);
  const levelingSettings = settings.leveling;
  
  const nextLevelXp = getXpForLevel(level + 1);
  const xpUntilNextLevel = Math.max(0, nextLevelXp - totalXp);
  const avatarUrl = (message.member ?? message.author).displayAvatarURL({
    extension: "png",
    size: 256,
  });
  const components = [
    new ContainerBuilder().setAccentColor(16376495).addSectionComponents(
      new SectionBuilder()
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        .addTextDisplayComponents(
          (t) => t.setContent(`### 🎊 <@${message.author.id}> just reached level **${level}**!`),
          (t) => t.setContent(`**Total XP:** ${totalXp}`),
          (t) => t.setContent(`**XP Until Next Level:** ${xpUntilNextLevel}`),
        ),
    ),
  ];

  let announcementChannel = message.channel
  if (levelingSettings.announcement_channel_id) {
    announcementChannel = message.guild.channels.cache.get(levelingSettings.announcement_channel_id);
  }
    
  return announcementChannel.send({
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [message.author.id] },
  });
}

async function handleMessage(message) {
  if (!message.inGuild() || message.author.bot) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const cooldownKey = `${guildId}:${userId}`;

    if (xpCooldowns.has(cooldownKey)) return;

  xpCooldowns.add(cooldownKey);

  try {
    const xpDelta = Math.floor(Math.random() * 11) + 5;
    const profile = await awardMessageXp(guildId, userId, xpDelta);

    console.log(`Awarded ${xpDelta} XP to ${profile.user_id}`);

    const previousLevel = getLevelFromXp(profile.xp - xpDelta);
    const currentLevel = getLevelFromXp(profile.xp);

    if (currentLevel > previousLevel) {
      await sendLevelUpMessage(message, currentLevel, profile.xp);
    }
  } catch (error) {
    xpCooldowns.delete(cooldownKey);
    throw error;
  }

  setTimeout(() => xpCooldowns.delete(cooldownKey), 60_000).unref();
}

module.exports = { handleMessage, sendLevelUpMessage };
