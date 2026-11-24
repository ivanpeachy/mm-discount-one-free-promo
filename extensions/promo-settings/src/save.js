import { CONFIG_KEY, CONFIG_NAMESPACE, normalizeConfig, validateConfig } from "./config.js";

export async function saveConfiguration(api, value) {
  const config = normalizeConfig(value);
  const errors = validateConfig(config);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const updates = [
    ["updateDiscountClasses", ["product"]],
    ["updatePurchaseType", config.purchaseType],
    ["updateRecurringCycleLimit", config.purchaseType === "one_time_purchase" ? null : config.recurringCycleLimit],
  ];
  for (const [method, next] of updates) {
    if (typeof api.discounts?.[method] !== "function") {
      throw new Error("This editor requires Shopify Admin UI Extensions API 2026-10.");
    }
    const result = await api.discounts[method](next);
    if (!result?.success) throw new Error(result?.errors?.map(e => e.message).join(" ") || "Shopify could not update the discount settings.");
  }
  const result = await api.applyMetafieldChange({
    type: "updateMetafield",
    namespace: CONFIG_NAMESPACE,
    key: CONFIG_KEY,
    value: JSON.stringify(config),
    valueType: "json",
  });
  if (result.type === "error") throw new Error(result.message);
  if (result.type !== "success") throw new Error("Shopify did not confirm the settings were saved.");
  return config;
}
