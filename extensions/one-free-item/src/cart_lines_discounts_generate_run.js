import { normalizeConfig, validateConfig } from "./config.js";

export function cartLinesDiscountsGenerateRun(input) {
  const raw = input.discount?.metafield?.jsonValue;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {operations: []};
  const config = normalizeConfig(raw);
  if (Object.keys(validateConfig(config)).length) return {operations: []};
  if (!input.discount.discountClasses?.includes("PRODUCT")) return {operations: []};
  const rate = Number(input.presentmentCurrencyRate);
  if (!Number.isFinite(rate) || rate <= 0) return {operations: []};

  const variants = new Set(config.eligibleVariantIds);
  const products = new Set(config.eligibleProductIds);
  const eligible = input.cart.lines.filter(line => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) return false;
    const subscription = Boolean(line.sellingPlanAllocation);
    if (config.purchaseType === "one_time_purchase" && subscription) return false;
    if (config.purchaseType === "subscription" && !subscription) return false;
    const variant = line.merchandise;
    if (variant.__typename !== "ProductVariant") return false;
    const price = Number(line.cost.amountPerQuantity.amount);
    if (!Number.isFinite(price) || price < 0) return false;
    if (config.appliesTo === "all") return true;
    if (config.appliesTo === "collections") return Boolean(variant.product.inEligibleCollection);
    return variants.has(variant.id) || products.has(variant.product.id);
  });

  const quantity = eligible.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = eligible.reduce((sum, line) => sum + Number(line.cost.subtotalAmount.amount), 0);
  if (config.minimum.type === "quantity" && quantity < config.minimum.value) return {operations: []};
  if (config.minimum.type === "amount" && (!Number.isFinite(subtotal) || subtotal + 0.000001 < config.minimum.value * rate)) return {operations: []};

  const ranked = [...eligible];
  if (config.priority !== "cart_order") {
    ranked.sort((a, b) => {
      const difference = Number(a.cost.amountPerQuantity.amount) - Number(b.cost.amountPerQuantity.amount);
      return config.priority === "highest_price" ? -difference : difference;
    });
  }

  let remaining = config.maximumQuantity;
  const targets = [];
  for (const line of ranked) {
    if (remaining === 0) break;
    const count = Math.min(line.quantity, remaining);
    targets.push({cartLine: {id: line.id, quantity: count}});
    remaining -= count;
  }
  if (!targets.length) return {operations: []};

  const value = config.valueType === "percentage"
    ? {percentage: {value: String(config.value)}}
    : {fixedAmount: {amount: String(Math.round(config.value * rate * 1000000) / 1000000), appliesToEachItem: true}};

  return {operations: [{
    productDiscountsAdd: {
      candidates: [{targets, value, message: config.valueType === "percentage" && config.value === 100 ? "Promotional item" : "Promotional discount"}],
      selectionStrategy: "FIRST",
    },
  }]};
}
