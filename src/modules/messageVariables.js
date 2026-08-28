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

const messageVariableGroups = Object.freeze({
  user: Object.freeze([
    ["user", "the user's username"],
    ["user.id", "the user's ID"],
    ["user.mention", "a mention of the user"],
    ["user.name", "the user's display name, global name, or username as fallback"],
    ["user.username", "the user's username"],
    ["user.avatar", "the URL of the user's avatar"],
    ["user.banner", "the URL of the user's banner, or None"],
    ["user.bot", "whether the user is a bot (Yes or No)"],
    ["user.created_at", "when the account was created, shown as relative time"],
    ["user.created_at_timestamp", "the account creation Unix timestamp"],
    ["user.created_at_iso", "the account creation time in ISO format"],
    ["user.created_at_date", "the account creation date in YYYY-MM-DD format"],
    ["user.joined_at", "when the user joined the server, shown as relative time"],
    ["user.joined_at_timestamp", "the server join Unix timestamp"],
    ["user.role_count", "the number of roles the user has, excluding @everyone"],
    ["user.roles", "the user's roles, ordered from highest to lowest"],
    ["user.nick", "the user's server nickname, or None"],
  ]),
  guild: Object.freeze([
    ["guild.id", "the server's ID"],
    ["guild.name", "the server's name"],
    ["guild.member_count", "the server's member count"],
    ["guild.icon", "the URL of the server's icon, or None"],
    ["guild.owner", "a mention of the server owner"],
    ["guild.owner_id", "the server owner's ID"],
    ["guild.boost_count", "the server's boost count"],
    ["guild.boost_tier", "the server's boost tier"],
    ["guild.created_at", "when the server was created, shown as relative time"],
    ["guild.created_at_date", "the server creation date in YYYY-MM-DD format"],
  ]),
  channel: Object.freeze([
    ["channel.id", "the channel's ID"],
    ["channel.mention", "a mention of the channel"],
    ["channel.name", "the channel's name"],
    ["channel.topic", "the channel's topic, or None"],
    ["channel.category_id", "the channel category's ID, or None"],
    ["channel.is_thread", "whether the channel is a thread (Yes or No)"],
    ["channel.created_at", "when the channel was created, shown as relative time"],
  ]),
});

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
  messageVariableGroups,
  replaceMessageVariables,
};
