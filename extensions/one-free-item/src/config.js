export const CONFIG_NAMESPACE = "$app";
export const CONFIG_KEY = "function-configuration";

export function defaultConfig() {
  return {
    schemaVersion: 2,
    valueType: "percentage",
    value: 100,
    appliesTo: "products",
    products: [],
    collections: [],
    eligibleVariantIds: [],
    eligibleProductIds: [],
    eligibleCollectionIds: [],
    purchaseType: "one_time_purchase",
    recurringCycleLimit: null,
    maximumQuantity: 1,
    priority: "lowest_price",
    minimum: { type: "none", value: 0 },
  };
}

export function normalizeConfig(raw = {}) {
  const defaults = defaultConfig();
  const config = {
    ...defaults, ...raw,
    minimum: { ...defaults.minimum, ...(raw.minimum || {}) },
    products: Array.isArray(raw.products) ? raw.products : [],
    collections: Array.isArray(raw.collections) ? raw.collections : [],
    eligibleVariantIds: Array.isArray(raw.eligibleVariantIds) ? raw.eligibleVariantIds : [],
    eligibleProductIds: Array.isArray(raw.eligibleProductIds) ? raw.eligibleProductIds : [],
    eligibleCollectionIds: Array.isArray(raw.eligibleCollectionIds) ? raw.eligibleCollectionIds : [],
  };
  config.value = Number(config.value);
  config.maximumQuantity = Number(config.maximumQuantity);
  config.minimum.value = Number(config.minimum.value);
  config.recurringCycleLimit = config.recurringCycleLimit === null || config.recurringCycleLimit === ""
    ? null : Number(config.recurringCycleLimit);
  if (config.products.length) {
    config.eligibleProductIds = config.products.filter(p => p.allVariants).map(p => p.id);
    config.eligibleVariantIds = config.products.filter(p => !p.allVariants)
      .flatMap(p => (p.variants || []).map(v => v.id));
  }
  if (config.collections.length) {
    config.eligibleCollectionIds = config.collections.map(c => c.id);
  }
  for (const key of ["eligibleVariantIds", "eligibleProductIds", "eligibleCollectionIds"]) {
    config[key] = [...new Set(config[key])];
  }
  return config;
}

export function validateConfig(config) {
  const errors = {};
  if (!["percentage", "fixed_amount"].includes(config.valueType)) errors.valueType = "Choose a discount type.";
  if (!Number.isFinite(config.value) || config.value <= 0 || (config.valueType === "percentage" && config.value > 100)) {
    errors.value = config.valueType === "percentage" ? "Enter a percentage above 0 and up to 100." : "Enter an amount above 0.";
  }
  if (!["all", "products", "collections"].includes(config.appliesTo)) errors.appliesTo = "Choose which products qualify.";
  if (config.appliesTo === "products" && !config.eligibleVariantIds.length && !config.eligibleProductIds.length) errors.products = "Select at least one product or variant.";
  if (config.appliesTo === "collections" && !config.eligibleCollectionIds.length) errors.collections = "Select at least one collection.";
  if (config.eligibleCollectionIds.length > 100) errors.collections = "Select at most 100 collections.";
  if (config.eligibleVariantIds.some(id => !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(id))) errors.products = "Invalid variant selection. Select the products again.";
  if (config.eligibleProductIds.some(id => !/^gid:\/\/shopify\/Product\/\d+$/.test(id))) errors.products = "Invalid product selection. Select the products again.";
  if (config.eligibleCollectionIds.some(id => !/^gid:\/\/shopify\/Collection\/\d+$/.test(id))) errors.collections = "Invalid collection selection.";
  if (!["one_time_purchase", "subscription", "both"].includes(config.purchaseType)) errors.purchaseType = "Choose a purchase type.";
  if (!Number.isSafeInteger(config.maximumQuantity) || config.maximumQuantity < 1) errors.maximumQuantity = "Enter a whole number of at least 1.";
  if (!["lowest_price", "highest_price", "cart_order"].includes(config.priority)) errors.priority = "Choose which eligible items receive the discount first.";
  if (!["none", "amount", "quantity"].includes(config.minimum.type)) errors.minimum = "Choose a minimum requirement.";
  if (config.minimum.type !== "none" && (!Number.isFinite(config.minimum.value) || config.minimum.value <= 0)) errors.minimum = "Enter a minimum greater than 0.";
  if (config.minimum.type === "quantity" && !Number.isSafeInteger(config.minimum.value)) errors.minimum = "Enter a whole number of items.";
  if (config.recurringCycleLimit !== null && (!Number.isSafeInteger(config.recurringCycleLimit) || config.recurringCycleLimit < 0)) errors.recurringCycleLimit = "Enter a whole number of billing cycles; 0 means unlimited.";
  if (new TextEncoder().encode(JSON.stringify(config)).length > 10000) errors.products = "This configuration is too large. Reduce the selection or use a collection.";
  return errors;
}

export function parseConfig(value) {
  if (!value) return defaultConfig();
  return normalizeConfig(typeof value === "string" ? JSON.parse(value) : value);
}

export function productsFromPicker(selection) {
  return selection.map(product => ({
    id: product.id,
    title: product.title,
    image: product.images?.[0]?.originalSrc || product.images?.[0]?.url || "",
    allVariants: false,
    variants: (product.variants || []).map(v => ({id: v.id, title: v.title || "Default"})),
  }));
}
