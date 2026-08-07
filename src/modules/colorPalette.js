const path = require("node:path");
const { Builder, Font, JSX } = require("canvacord");
const { createCanvas } = require("@napi-rs/canvas");

const outfitBoldFont = Font.fromFileSync(
  path.join(__dirname, "../../assets/fonts/Outfit-Bold.ttf"),
  "outfit-bold",
);
const outfitExtraBoldFont = Font.fromFileSync(
  path.join(__dirname, "../../assets/fonts/Outfit-ExtraBold.ttf"),
  "outfit-extra-bold",
);
const textMeasurementContext = createCanvas(1, 1).getContext("2d");
const ACHROMATIC_CHROMA = 0.02;
const HUE_GROUP_SIZE = 15;
const HUE_START = 20;

function colorMetricsFor(hex) {
  const [red, green, blue] = [0, 2, 4].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const relativeLuminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180 / Math.PI - HUE_START + 360) % 360;

  return { relativeLuminance, lightness, chroma, hue };
}

function sortColors(colors) {
  return colors
    .map((color) => ({ color, metrics: colorMetricsFor(color.hex) }))
    .sort((left, right) => {
      const leftIsAchromatic = left.metrics.chroma < ACHROMATIC_CHROMA;
      const rightIsAchromatic = right.metrics.chroma < ACHROMATIC_CHROMA;
      if (leftIsAchromatic !== rightIsAchromatic) return leftIsAchromatic ? 1 : -1;
      if (leftIsAchromatic) {
        return left.metrics.lightness - right.metrics.lightness
          || left.color.hex.localeCompare(right.color.hex);
      }

      return Math.floor(left.metrics.hue / HUE_GROUP_SIZE)
          - Math.floor(right.metrics.hue / HUE_GROUP_SIZE)
        || left.metrics.lightness - right.metrics.lightness
        || left.metrics.chroma - right.metrics.chroma
        || left.metrics.hue - right.metrics.hue
        || left.color.hex.localeCompare(right.color.hex);
    })
    .map(({ color }) => color);
}

function textColorFor(hex) {
  return colorMetricsFor(hex).relativeLuminance > 0.179 ? "#111318" : "#FFFFFF";
}

function wrapTextToWidth(text, maximumWidth) {
  const lines = [];
  let currentLine = "";

  for (const word of text.split(/\s+/)) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (textMeasurementContext.measureText(candidate).width <= maximumWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }
    if (textMeasurementContext.measureText(word).width <= maximumWidth) {
      currentLine = word;
      continue;
    }

    let fragment = "";
    for (const character of word) {
      if (
        fragment &&
        textMeasurementContext.measureText(fragment + character).width > maximumWidth
      ) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment += character;
      }
    }
    currentLine = fragment;
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function fitCardText(text, fontName, maximumFontSize, maximumWidth, maximumHeight) {
  for (let fontSize = maximumFontSize; fontSize >= 10; fontSize -= 1) {
    textMeasurementContext.font = `800 ${fontSize}px "${fontName}"`;
    const lines = wrapTextToWidth(text, maximumWidth);
    const lineHeight = Math.ceil(fontSize * 1.08);
    if (lines.length * lineHeight <= maximumHeight) return { fontSize, lineHeight, lines };
  }

  return { fontSize: 10, lineHeight: 11, lines: wrapTextToWidth(text, maximumWidth) };
}

function parseColors(input) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const colors = [];
  const seenHexes = new Set();
  const seenNames = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^#?([0-9a-fA-F]{6})(?:\s{2,}(.+))?$/);
    if (!match) {
      throw new Error(`Line ${index + 1} must use \`#RRGGBB  Optional name\` format.`);
    }

    const hex = match[1].toUpperCase();
    const name = match[2]?.trim() || null;
    if (name?.length > 100) {
      throw new Error(`The name on line ${index + 1} must be 100 characters or fewer.`);
    }
    if (seenHexes.has(hex)) throw new Error(`The color #${hex} appears more than once.`);
    const normalizedName = name?.toLowerCase();
    if (normalizedName && seenNames.has(normalizedName)) {
      throw new Error(`The color name "${name}" appears more than once.`);
    }

    seenHexes.add(hex);
    if (normalizedName) seenNames.add(normalizedName);
    colors.push({ hex, name });
  }

  return colors;
}

async function fetchRole(guild, roleId) {
  return guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
}

async function saveColors(client, guild, desiredColors) {
  const db = client.modules.db;
  const existingColors = await db.getColors(guild.id);
  const existingByHex = new Map(existingColors.map((color) => [color.hex, color]));
  const desiredHexes = new Set(desiredColors.map((color) => color.hex));
  const result = { added: 0, updated: 0, removed: 0, failed: 0, positionError: null };

  for (const color of existingColors) {
    if (desiredHexes.has(color.hex)) continue;
    const role = await fetchRole(guild, color.role_id);
    if (role && !role.editable) {
      result.failed += 1;
      continue;
    }
    if (role) await role.delete("Removed from cosmetic color palette");
    await db.removeColorByRole(guild.id, color.role_id);
    result.removed += 1;
  }

  for (const color of desiredColors) {
    const existingColor = existingByHex.get(color.hex);
    let role = existingColor ? await fetchRole(guild, existingColor.role_id) : null;
    const roleName = color.name || `#${color.hex}`;
    const roleColor = parseInt(color.hex, 16);

    if (role && !role.editable) {
      result.failed += 1;
      continue;
    }
    if (role) {
      if (role.name !== roleName || role.color !== roleColor) {
        role = await role.edit({
          name: roleName,
          colors: { primaryColor: roleColor },
          reason: "Cosmetic color palette updated",
        });
        result.updated += 1;
      }
      await db.setColor(guild.id, role.id, color.hex, color.name);
      continue;
    }

    role = await guild.roles.create({
      name: roleName,
      colors: { primaryColor: roleColor },
      permissions: [],
      hoist: false,
      mentionable: false,
      reason: "Added to cosmetic color palette",
    });
    try {
      await db.setColor(guild.id, role.id, color.hex, color.name);
    } catch (error) {
      await role.delete("Failed to save cosmetic color").catch(() => null);
      throw error;
    }
    result.added += 1;
  }

  const settings = await db.getSettings(guild.id);
  if (settings.color.anchor_role_id) {
    const savedColors = await db.getColors(guild.id);
    await client.modules
      .positionColorRoles(guild, savedColors, settings.color.anchor_role_id)
      .catch((error) => {
        result.positionError = error.message;
      });
  }

  return result;
}

async function renderColorPaletteRow(colors) {
  const fontName = outfitExtraBoldFont.name;

  const cardSize = 208;
  const gap = 12;
  const padding = 20;
  const width = cardSize * 5 + gap * 4 + padding * 2;
  const height = cardSize + padding * 2;
  const builder = new Builder(width, height).setStyle({
    display: "flex",
    gap: `${gap}px`,
    padding: `${padding}px`,
    backgroundColor: "transparent",
  });

  for (const color of colors) {
    const textColor = textColorFor(color.hex);
    const label = color.name || `#${color.hex}`;
    const fittedText = fitCardText(
      label,
      fontName,
      color.name ? 35 : 30,
      176,
      color.name ? 140 : 54,
    );
    builder.addComponent(
      JSX.createElement(
        "div",
        {
          style: {
            position: "relative",
            width: `${cardSize}px`,
            height: `${cardSize}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            backgroundColor: `#${color.hex}`,
            borderRadius: "22px",
            boxShadow: "0 4px 10px rgba(0, 0, 0, 0.3)",
            color: textColor,
          },
        },
        ...(color.name
          ? [JSX.createElement(
              "div",
              {
                style: {
                  position: "absolute",
                  top: "13px",
                  right: "15px",
                  display: "flex",
                  fontFamily: outfitBoldFont.name,
                  fontSize: "19px",
                  fontWeight: 700,
                  opacity: 0.84,
                },
              },
              `#${color.hex}`,
            )]
          : []),
        JSX.createElement(
          "div",
          {
            style: {
              width: "176px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fontName,
              fontSize: `${fittedText.fontSize}px`,
              fontWeight: 800,
              lineHeight: `${fittedText.lineHeight}px`,
              textAlign: "center",
            },
          },
          ...fittedText.lines.map((line) =>
            JSX.createElement(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                },
              },
              line,
            )),
        ),
      ),
    );
  }

  return builder.build({ format: "png" });
}

module.exports = { parseColors, renderColorPaletteRow, saveColors, sortColors };
