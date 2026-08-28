function unixTimestamp(date) {
  return date ? Math.floor(date.getTime() / 1_000) : null;
}

function relativeTimestamp(date) {
  const timestamp = unixTimestamp(date);
  return timestamp === null ? "Unknown" : `<t:${timestamp}:R>`;
}

function dateOnly(date) {
  return date ? date.toISOString().slice(0, 10) : "Unknown";
}

async function replaceMessageVariables(template, member, channel) {
  const { guild } = member;
  let user = member.user;

  if (template.includes("{user.banner}")) {
    user = await member.client.users.fetch(member.id, { force: true }).catch(() => user);
  }

  const roles = member.roles.cache
    .filter((role) => role.id !== guild.id)
    .sort((left, right) => right.position - left.position);
  const variables = {
    user: user.username,
    "user.id": user.id,
    "user.mention": `<@${user.id}>`,
    "user.name": member.displayName || user.globalName || user.username,
    "user.username": user.username,
    "user.avatar": user.displayAvatarURL({ size: 4096 }),
    "user.banner": user.bannerURL({ size: 4096 }) || "None",
    "user.bot": user.bot ? "Yes" : "No",
    "user.created_at": relativeTimestamp(user.createdAt),
    "user.created_at_timestamp": String(unixTimestamp(user.createdAt)),
    "user.created_at_iso": user.createdAt.toISOString(),
    "user.created_at_date": dateOnly(user.createdAt),
    "user.joined_at": relativeTimestamp(member.joinedAt),
    "user.joined_at_timestamp": member.joinedAt ? String(unixTimestamp(member.joinedAt)) : "Unknown",
    "user.role_count": String(roles.size),
    "user.roles": roles.size ? roles.map((role) => role.toString()).join(", ") : "None",
    "user.nick": member.nickname || "None",
    "guild.id": guild.id,
    "guild.name": guild.name,
    "guild.member_count": String(guild.memberCount),
    "guild.icon": guild.iconURL({ size: 4096 }) || "None",
    "guild.owner": `<@${guild.ownerId}>`,
    "guild.owner_id": guild.ownerId,
    "guild.boost_count": String(guild.premiumSubscriptionCount || 0),
    "guild.boost_tier": String(guild.premiumTier),
    "guild.created_at": relativeTimestamp(guild.createdAt),
    "guild.created_at_date": dateOnly(guild.createdAt),
    "channel.id": channel.id,
    "channel.mention": channel.toString(),
    "channel.name": channel.name,
    "channel.topic": channel.topic || "None",
    "channel.category_id": channel.parentId || "None",
    "channel.is_thread": channel.isThread() ? "Yes" : "No",
    "channel.created_at": relativeTimestamp(channel.createdAt),
  };

  return template.replace(/\{([a-z_]+(?:\.[a-z_]+)*)\}/g, (match, name) => (
    Object.hasOwn(variables, name) ? variables[name] : match
  ));
}

module.exports = {
  replaceMessageVariables,
};
