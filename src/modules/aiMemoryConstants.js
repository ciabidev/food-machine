const AI_MEMORY_CATEGORIES = Object.freeze([
  "identity",
  "preferences",
  "relationships",
  "projects",
  "roles",
  "procedures",
  "server_info",
  "communication",
  "other",
]);

const MAX_AI_MEMORY_TITLE_LENGTH = 100;
const MAX_AI_MEMORY_CONTENT_LENGTH = 2_000;
const MAX_AI_MEMORY_MUTATIONS = 30;

function normalizeAiMemoryMutations(value) {
  const source = value && typeof value === "object" ? value : {};
  const create = Array.isArray(source.create) ? source.create : [];
  const update = Array.isArray(source.update) ? source.update : [];
  const remove = Array.isArray(source.delete) ? source.delete : [];
  if (create.length + update.length + remove.length > MAX_AI_MEMORY_MUTATIONS) {
    throw new RangeError(`AI memory updates are limited to ${MAX_AI_MEMORY_MUTATIONS} changes.`);
  }

  const normalizeEntry = (entry, needsId) => {
    const category = String(entry?.category ?? "").trim().toLowerCase();
    const title = String(entry?.title ?? "").replace(/\s+/g, " ").trim();
    const content = String(entry?.content ?? "").trim();
    const memoryId = String(entry?.memory_id ?? "").trim();
    if (!AI_MEMORY_CATEGORIES.includes(category)) {
      throw new TypeError(`Invalid AI memory category: ${category || "[empty]"}`);
    }
    if (!title || title.length > MAX_AI_MEMORY_TITLE_LENGTH) {
      throw new TypeError("Invalid AI memory title.");
    }
    if (!content || content.length > MAX_AI_MEMORY_CONTENT_LENGTH) {
      throw new TypeError("Invalid AI memory content.");
    }
    if (needsId && !/^[a-f0-9]{24}$/i.test(memoryId)) {
      throw new TypeError("Invalid AI memory ID.");
    }
    return {
      ...(needsId ? { memory_id: memoryId } : {}),
      category,
      title,
      content,
    };
  };

  const normalizedDeletes = remove.map((memoryId) => String(memoryId).trim());
  if (normalizedDeletes.some((memoryId) => !/^[a-f0-9]{24}$/i.test(memoryId))) {
    throw new TypeError("Invalid deleted AI memory ID.");
  }

  return {
    create: create.map((entry) => normalizeEntry(entry, false)),
    update: update.map((entry) => normalizeEntry(entry, true)),
    delete: [...new Set(normalizedDeletes)],
  };
}

module.exports = {
  AI_MEMORY_CATEGORIES,
  MAX_AI_MEMORY_CONTENT_LENGTH,
  MAX_AI_MEMORY_MUTATIONS,
  MAX_AI_MEMORY_TITLE_LENGTH,
  normalizeAiMemoryMutations,
};
