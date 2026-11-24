import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useRef, useState} from "preact/hooks";
import {CONFIG_KEY, parseConfig, normalizeConfig, validateConfig, productsFromPicker} from "./config.js";
import {saveConfiguration} from "./save.js";
import {CURRENCY_QUERY, hydrateSelections} from "./catalog.js";

export default async () => {
  render(<DiscountSettings />, document.body);
};

function emptyErrors() {
  return {value: "", recurringCycleLimit: "", maximumQuantity: "", minimum: ""};
}

function errorMessage(value) {
  return value instanceof Error ? value.message : String(value);
}

function currentState() {
  const text = shopify.data?.metafields?.find(field => field.key === CONFIG_KEY)?.value;
  try { return {config: parseConfig(text), error: ""}; }
  catch { return {config: parseConfig(), error: "Saved settings could not be read. Configure the promotion again before saving."}; }
}

export function DiscountSettings() {
  const savedText = shopify.data?.metafields?.find(field => field.key === CONFIG_KEY)?.value || "";
  const [config, setConfig] = useState(() => currentState().config);
  const [initial, setInitial] = useState(() => currentState().config);
  const [error, setError] = useState(() => currentState().error);
  const [fieldErrors, setFieldErrors] = useState(emptyErrors());
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    let active = true;
    const state = currentState();
    setLoading(true);
    setError(state.error);
    hydrateSelections(shopify, state.config).then(next => {
      if (!active) return;
      setConfig(next);
      setInitial(next);
    }).catch(err => {
      if (active) setError(errorMessage(err));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [savedText]);

  useEffect(() => {
    let active = true;
    shopify.query(CURRENCY_QUERY, {version: "2026-10"}).then(result => {
      if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join(" "));
      if (active) setCurrency(String(result.data?.shop?.currencyCode || ""));
    }).catch(err => { if (active) setError(errorMessage(err)); });
    if (!initialized.current) {
      initialized.current = true;
      Promise.resolve(shopify.discounts.updateDiscountClasses(["product"])).then(result => {
        if (result.success === false && active) setError("Shopify could not initialize the product discount.");
      }).catch(err => { if (active) setError(errorMessage(err)); });
    }
    return () => { active = false; };
  }, []);

  function change(key, value) {
    setConfig(previous => ({...previous, [key]: value}));
    setFieldErrors(emptyErrors());
    setError("");
  }

  async function changePurchaseType(value) {
    const result = await shopify.discounts.updatePurchaseType(value);
    if (result.success === false) {
      setError(result.errors?.map(item => item.message).join(" ") || "Could not change purchase type.");
      return;
    }
    change("purchaseType", value);
  }

  async function pickProducts(productToEdit = null) {
    setPicking(true);
    setError("");
    try {
      const currentProducts = productToEdit ? [productToEdit] : config.products;
      const selection = await shopify.resourcePicker({
        type: "product",
        action: "select",
        multiple: true,
        selectionIds: currentProducts.map(product => product.allVariants
          ? {id: product.id}
          : {id: product.id, variants: product.variants.map(variant => ({id: variant.id}))}),
        filter: {
          variants: true,
          ...(productToEdit ? {query: "id:" + productToEdit.id.split("/").pop()} : {}),
        },
        ...(search && !productToEdit ? {query: search} : {}),
      });
      if (selection === undefined) return;
      const selected = productsFromPicker(selection);
      const nextProducts = productToEdit
        ? [...config.products.filter(product => product.id !== productToEdit.id), ...selected]
        : selected;
      change("products", nextProducts);
      // Clear derived IDs when the final selection is removed.
      if (!nextProducts.length) setConfig(previous => ({...previous, products: [], eligibleVariantIds: [], eligibleProductIds: []}));
    } catch (err) { setError(errorMessage(err)); }
    finally { setPicking(false); }
  }

  async function pickCollections() {
    setPicking(true);
    setError("");
    try {
      const selected = await shopify.resourcePicker({
        type: "collection", action: "select", multiple: 100,
        selectionIds: config.collections.map(collection => ({id: collection.id})),
      });
      if (selected === undefined) return;
      change("collections", selected.map(collection => ({id: collection.id, title: collection.title})));
      if (!selected.length) setConfig(previous => ({...previous, eligibleCollectionIds: []}));
    } catch (err) { setError(errorMessage(err)); }
    finally { setPicking(false); }
  }

  function removeProduct(id) {
    const products = config.products.filter(product => product.id !== id);
    setConfig(previous => ({...previous, products, ...(products.length ? {} : {eligibleVariantIds: [], eligibleProductIds: []})}));
  }

  function removeCollection(id) {
    const collections = config.collections.filter(collection => collection.id !== id);
    setConfig(previous => ({...previous, collections, eligibleCollectionIds: collections.map(collection => collection.id)}));
  }

  function submit(event) {
    if (loading || picking) {
      event.preventDefault();
      setError("Wait for the current selection to finish.");
      return;
    }
    const next = normalizeConfig(config);
    const errors = validateConfig(next);
    setFieldErrors({...emptyErrors(), ...errors});
    if (Object.keys(errors).length) {
      event.preventDefault();
      setError(String(Object.values(errors)[0]));
      return;
    }
    event.waitUntil(
      saveConfiguration(shopify, next).then(saved => {
        setConfig(saved);
        setInitial(saved);
        setError("");
      }).catch(err => {
        setError(errorMessage(err));
        throw err;
      }),
    );
  }

  function reset() {
    setConfig(structuredClone(initial));
    setError("");
    setFieldErrors(emptyErrors());
    setSearch("");
  }

  const moneyUnit = currency || "store currency";
  return (
    <s-function-settings onSubmit={submit} onReset={reset}>
      <s-box display="none">
        <s-text-field name="promotion-configuration" label="Promotion configuration"
          value={JSON.stringify(config)} defaultValue={JSON.stringify(initial)} />
      </s-box>
      <s-stack direction="block" gap="large">
        {error ? <s-banner tone="critical">{error}</s-banner> : null}
        {loading ? <s-spinner accessibilityLabel="Loading promotion settings" /> : null}
        <s-heading>Product promotion</s-heading>
        <s-section heading="Discount value">
          <s-stack direction="block" gap="base">
            <s-select label="Discount type" name="valueType" value={config.valueType}
              onChange={event => change("valueType", event.currentTarget.value)}>
              <s-option value="percentage">Percentage</s-option>
              <s-option value="fixed_amount">Fixed amount per discounted unit</s-option>
            </s-select>
            <s-number-field label={config.valueType === "percentage" ? "Percentage off" : "Amount off (" + moneyUnit + ")"}
              name="discountValue" value={String(config.value)} min={0} max={config.valueType === "percentage" ? 100 : undefined}
              step={0.01} suffix={config.valueType === "percentage" ? "%" : currency}
              error={fieldErrors.value || ""} onChange={event => change("value", event.currentTarget.value)} />
            <s-select label="Applies to" name="appliesTo" value={config.appliesTo}
              onChange={event => change("appliesTo", event.currentTarget.value)}>
              <s-option value="all">All products</s-option>
              <s-option value="products">Specific products and variants</s-option>
              <s-option value="collections">Specific collections</s-option>
            </s-select>
            {config.appliesTo === "products" ? (
              <s-stack direction="block" gap="base">
                <s-search-field label="Search products" name="productSearch" value={search}
                  onChange={event => setSearch(event.currentTarget.value)} placeholder="Search products" />
                <s-button disabled={loading || picking} onClick={() => pickProducts()}>Browse products</s-button>
                {config.products.map(product => (
                  <s-section key={product.id}>
                    <s-stack direction="block" gap="base">
                      <s-stack direction="inline" alignItems="center" justifyContent="space-between" gap="base">
                        {product.image ? <s-thumbnail src={product.image} alt={product.title} /> : null}
                        <s-text type="strong">{product.title}</s-text>
                        <s-button variant="tertiary" disabled={picking} onClick={() => pickProducts(product)}>Edit variants</s-button>
                        <s-button variant="tertiary" disabled={picking} onClick={() => removeProduct(product.id)}>Remove</s-button>
                      </s-stack>
                      <s-text color="subdued">{product.allVariants ? "All variants" : product.variants.length + " variants selected"}</s-text>
                      <s-checkbox label="Include all current and future variants" checked={Boolean(product.allVariants)}
                        onChange={event => change("products", config.products.map(item => item.id === product.id ? {...item, allVariants: event.currentTarget.checked} : item))} />
                    </s-stack>
                  </s-section>
                ))}
              </s-stack>
            ) : null}
            {config.appliesTo === "collections" ? (
              <s-stack direction="block" gap="base">
                <s-button disabled={loading || picking} onClick={pickCollections}>Browse collections</s-button>
                {config.collections.map(collection => (
                  <s-stack key={collection.id} direction="inline" alignItems="center" justifyContent="space-between">
                    <s-text>{collection.title}</s-text>
                    <s-button variant="tertiary" onClick={() => removeCollection(collection.id)}>Remove</s-button>
                  </s-stack>
                ))}
              </s-stack>
            ) : null}
            <s-select label="Purchase type" name="purchaseType" value={config.purchaseType}
              onChange={event => changePurchaseType(event.currentTarget.value)}>
              <s-option value="one_time_purchase">One-time purchase</s-option>
              <s-option value="subscription">Subscription</s-option>
              <s-option value="both">Both</s-option>
            </s-select>
            {config.purchaseType !== "one_time_purchase" ? (
              <s-number-field label="Subscription billing cycle limit" name="recurringCycleLimit"
                details="Leave empty or enter 0 to apply without a billing-cycle limit."
                value={config.recurringCycleLimit === null ? "" : String(config.recurringCycleLimit)}
                min={0} step={1} error={fieldErrors.recurringCycleLimit || ""}
                onChange={event => change("recurringCycleLimit", event.currentTarget.value)} />
            ) : null}
          </s-stack>
        </s-section>
        <s-section heading="Discounted quantity">
          <s-stack direction="block" gap="base">
            <s-number-field label="Maximum discounted units per order" name="maximumQuantity"
              value={String(config.maximumQuantity)} min={1} step={1} error={fieldErrors.maximumQuantity || ""}
              details="The limit is shared across every eligible product and variant."
              onChange={event => change("maximumQuantity", event.currentTarget.value)} />
            <s-select label="Apply to eligible items in this order" name="priority" value={config.priority}
              onChange={event => change("priority", event.currentTarget.value)}>
              <s-option value="lowest_price">Lowest price first</s-option>
              <s-option value="highest_price">Highest price first</s-option>
              <s-option value="cart_order">Cart line order</s-option>
            </s-select>
          </s-stack>
        </s-section>
        <s-section heading="Minimum purchase requirements">
          <s-stack direction="block" gap="base">
            <s-select label="Minimum requirement" name="minimumType" value={config.minimum.type}
              onChange={event => change("minimum", {...config.minimum, type: event.currentTarget.value})}>
              <s-option value="none">No minimum requirements</s-option>
              <s-option value="amount">Minimum purchase amount</s-option>
              <s-option value="quantity">Minimum quantity of items</s-option>
            </s-select>
            {config.minimum.type !== "none" ? (
              <s-number-field label={config.minimum.type === "amount" ? "Minimum eligible subtotal (" + moneyUnit + ")" : "Minimum eligible quantity"}
                name="minimumValue" value={String(config.minimum.value)} min={0} step={config.minimum.type === "quantity" ? 1 : 0.01}
                error={fieldErrors.minimum || ""}
                details="Counts eligible items matching the selected purchase type, before this discount."
                onChange={event => change("minimum", {...config.minimum, value: event.currentTarget.value})} />
            ) : null}
          </s-stack>
        </s-section>
      </s-stack>
    </s-function-settings>
  );
}
