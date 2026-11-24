export const CATALOG_QUERY = `query PromoResources($ids: [ID!]!) {
  nodes(ids: $ids) {
    __typename
    ... on ProductVariant { id title product { id title } }
    ... on Product { id title }
    ... on Collection { id title }
  }
}`;
export const CURRENCY_QUERY = "query PromoCurrency { shop { currencyCode } }";

export async function hydrateSelections(api, config) {
  if (config.products.length || config.collections.length) return config;
  const ids = [...config.eligibleVariantIds, ...config.eligibleProductIds, ...config.eligibleCollectionIds];
  if (!ids.length) return config;
  const nodes = [];
  for (let start = 0; start < ids.length; start += 100) {
    const result = await api.query(CATALOG_QUERY, {variables: {ids: ids.slice(start, start + 100)}, version: "2026-10"});
    if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join(" "));
    if (!result.data?.nodes) throw new Error("Shopify could not load the selected products.");
    nodes.push(...result.data.nodes);
  }
  const byProduct = new Map();
  const collections = [];
  for (const node of nodes) {
    if (!node) throw new Error("A previously selected resource is unavailable. Select the products again.");
    if (node.__typename === "Collection") {
      collections.push({id: node.id, title: node.title});
    } else if (node.__typename === "Product") {
      const previous = byProduct.get(node.id);
      byProduct.set(node.id, {id: node.id, title: node.title, image: "", allVariants: true, variants: previous?.variants || []});
    } else if (node.__typename === "ProductVariant") {
      if (!byProduct.has(node.product.id)) byProduct.set(node.product.id, {id: node.product.id, title: node.product.title, image: "", allVariants: false, variants: []});
      byProduct.get(node.product.id).variants.push({id: node.id, title: node.title});
    }
  }
  return {...config, products: [...byProduct.values()], collections};
}
