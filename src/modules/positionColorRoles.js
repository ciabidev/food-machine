module.exports = async function positionColorRoles(guild, colors, anchorRoleId) {
  if (!anchorRoleId || !colors.length) return 0;

  const anchorRole = guild.roles.cache.get(anchorRoleId) ||
    await guild.roles.fetch(anchorRoleId).catch(() => null);
  if (!anchorRole) throw new Error("The configured color anchor role no longer exists.");
  if (anchorRole.id === guild.roles.everyone.id) {
    throw new Error("Color roles cannot be placed below @everyone.");
  }

  const botHighestRole = guild.members.me.roles.highest;
  if (anchorRole.id !== botHighestRole.id && anchorRole.position >= botHighestRole.position) {
    throw new Error("The anchor role must be below the bot's highest role.");
  }

  const colorRoles = [];
  for (const color of colors) {
    const role = guild.roles.cache.get(color.role_id) ||
      await guild.roles.fetch(color.role_id).catch(() => null);
    if (!role) continue;
    if (!role.editable) {
      throw new Error("Every color role must be below the bot's highest role.");
    }
    colorRoles.push({ color, role });
  }
  if (!colorRoles.length) return 0;

  const sortedColors = guild.client.modules.colorPalette.sortColors(
    colorRoles.map(({ color }) => color),
  );
  const rolesById = new Map(colorRoles.map(({ role }) => [role.id, role]));

  // Move the bottom color first and insert each following color immediately
  // below the anchor. Discord shifts every role crossed by each move, keeping
  // the existing roles below the completed color block instead of assigning
  // duplicate positions in a role list from which the colors were removed.
  for (const color of sortedColors.reverse()) {
    await guild.roles.setPosition(
      rolesById.get(color.role_id),
      anchorRole.position - 1,
    );
  }

  return colorRoles.length;
};
