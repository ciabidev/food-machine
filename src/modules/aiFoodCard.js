const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require("discord.js");
const { unsplashAccessKey } = require("#config");

const FOOD_CARD_PATTERN = /\[\[FOOD_CARD\]\]\s*\n(\{[\s\S]*\})\s*$/;
const FOOD_IMAGE_TIMEOUT_MS = 5_000;

function parseFoodCard(replyText) {
  const match = replyText.match(FOOD_CARD_PATTERN);
  if (!match) return null;

  try {
    const food = JSON.parse(match[1].trim());
    const requiredFields = [
      "name",
      "emoji",
      "description",
      "ingredients",
    ];
    if (requiredFields.some((field) => typeof food[field] !== "string" || !food[field].trim())) {
      return null;
    }

    return Object.fromEntries(
      requiredFields.map((field) => [field, food[field].trim()]),
    );
  } catch {
    return null;
  }
}

function formatCardValue(value) {
  return value.replace(/\s+/g, " ").replaceAll("`", "'").trim();
}

function formatAttributionName(value) {
  return formatCardValue(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function addUnsplashAttributionParameters(value) {
  const url = new URL(value);
  url.searchParams.set("utm_source", "food_machine_discord_bot");
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}

async function findUnsplashFoodPhoto(dishName) {
  if (!unsplashAccessKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FOOD_IMAGE_TIMEOUT_MS);

  try {
    const searchParameters = new URLSearchParams({
      query: dishName,
      per_page: "1",
      content_filter: "high",
      client_id: unsplashAccessKey,
    });
    const response = await fetch(
      `https://api.unsplash.com/search/photos?${searchParameters}`,
      {
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      console.warn(
        `Unsplash food search failed with HTTP ${response.status}:`,
        payload?.errors?.join("; ") || response.statusText,
      );
      return null;
    }

    const payload = await response.json();
    const photo = payload.results?.[0];
    if (!photo) {
      console.warn(`Unsplash returned no food image for ${JSON.stringify(dishName)}.`);
      return null;
    }
    if (!photo.urls?.small || !photo.user?.links?.html || !photo.links?.html) {
      console.warn(`Unsplash returned incomplete photo data for ${JSON.stringify(dishName)}.`);
      return null;
    }

    return {
      url: photo.urls.small,
      photographerName: formatAttributionName(photo.user.name || photo.user.username || "Unknown"),
      photographerUrl: addUnsplashAttributionParameters(photo.user.links.html),
      photoUrl: addUnsplashAttributionParameters(photo.links.html),
    };
  } catch (error) {
    console.warn("Failed to find an AI food card thumbnail:", error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function createAiFoodCardComponents(replyText) {
  const food = parseFoodCard(replyText);
  if (!food) return null;

  const name = formatCardValue(food.name);
  const emoji = formatCardValue(food.emoji);

  const photo = await findUnsplashFoodPhoto(name);
  const content = [
    `## ${emoji} 🟢 \`${name}\``,
    formatCardValue(food.description),
    `-# **Ingredients:** ${formatCardValue(food.ingredients)}`,
    "",
    "enjoy!",
    photo
      ? `-# Photo by [${photo.photographerName}](${photo.photographerUrl}) on [Unsplash](${photo.photoUrl})`
      : null,
  ].filter((line) => line !== null).join("\n");
  const container = new ContainerBuilder().setAccentColor(0x57f287);

  if (photo) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(photo.url)
            .setDescription(`${name} thumbnail`),
        ),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  }

  return [container];
}

module.exports = createAiFoodCardComponents;
