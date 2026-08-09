const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require("discord.js");

const FOOD_CARD_PATTERN = /\[\[FOOD_CARD\]\]\s*\n(\{[\s\S]*\})\s*$/;
const MEAL_IMAGE_TIMEOUT_MS = 5_000;

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

async function findMealThumbnail(dishName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEAL_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(dishName)}`,
      { signal: controller.signal },
    );
    if (!response.ok) return null;

    const payload = await response.json();
    const meal = payload.meals?.find(
      (candidate) => candidate.strMeal?.toLowerCase() === dishName.toLowerCase(),
    ) || payload.meals?.[0];
    return meal?.strMealThumb ? `${meal.strMealThumb}/small` : null;
  } catch (error) {
    console.warn("Failed to find an AI food card thumbnail:", error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function createAiFoodCardComponents(replyText, footer) {
  const food = parseFoodCard(replyText);
  if (!food) return null;

  const name = formatCardValue(food.name);
  const emoji = formatCardValue(food.emoji);

  const content = [
    `## ${emoji} 🟢 \`${name}\``,
    formatCardValue(food.description),
    `-# **Ingredients:** ${formatCardValue(food.ingredients)}`,
    "",
    "enjoy!",
    footer,
  ].join("\n");
  const thumbnailUrl = await findMealThumbnail(name);
  const container = new ContainerBuilder().setAccentColor(0x57f287);

  if (thumbnailUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(thumbnailUrl)
            .setDescription(`${name} thumbnail`),
        ),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  }

  return [container];
}

module.exports = createAiFoodCardComponents;
