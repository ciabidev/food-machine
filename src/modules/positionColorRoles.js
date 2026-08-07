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

  const colorRoleIds = new Set(colors.map((color) => color.role_id));
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

  const remainingRoles = guild.roles.cache
    .filter((role) => !colorRoleIds.has(role.id))
    .sort((left, right) => left.position - right.position);
  const anchorIndex = [...remainingRoles.values()]
    .findIndex((role) => role.id === anchorRole.id);
  if (anchorIndex < 1) throw new Error("The selected anchor role is not available.");

  const sortedColors = guild.client.modules.colorPalette.sortColors(
    colorRoles.map(({ color }) => color),
  );
  const rolesById = new Map(colorRoles.map(({ role }) => [role.id, role]));
  const positions = sortedColors.reverse().map((color, index) => ({
    role: rolesById.get(color.role_id),
    position: anchorIndex + index,
  }));

  await guild.roles.setPositions(positions);
  return positions.length;
};
