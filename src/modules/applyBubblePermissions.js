const { PermissionFlagsBits } = require("discord.js");

module.exports = async function applyBubblePermissions(
  channel,
  bubble,
  previousUserIds = [],
) {
  const trustedUserIds = bubble.trusted_user_ids || [];
  const bannedUserIds = bubble.banned_user_ids || [];

  // Include previous users so removing someone from either list also removes
  // the old Discord overwrite that would otherwise keep allowing or denying them.
  const managedUserIds = new Set([
    ...previousUserIds,
    ...trustedUserIds,
    ...bannedUserIds,
  ]);

  // Preserve category, role, owner, and other unrelated overwrites.
  const overwrites = channel.permissionOverwrites.cache
    .filter((overwrite) => !managedUserIds.has(overwrite.id))
    .map((overwrite) => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield,
      deny: overwrite.deny.bitfield,
    }));

  for (const userId of trustedUserIds) {
    overwrites.push({
      id: userId,
      allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
    });
  }
  for (const userId of bannedUserIds) {
    overwrites.push({
      id: userId,
      deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
    });
  }

  await channel.permissionOverwrites.set(overwrites, "Bubble access list updated");
};
