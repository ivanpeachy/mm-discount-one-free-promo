import test from "node:test";
import assert from "node:assert/strict";
import {cartLinesDiscountsGenerateRun as run} from "../extensions/one-free-item/src/index.js";
import {defaultConfig, normalizeConfig, validateConfig, productsFromPicker} from "../extensions/promo-settings/src/config.js";
import {saveConfiguration} from "../extensions/promo-settings/src/save.js";
import {hydrateSelections} from "../extensions/promo-settings/src/catalog.js";

const variant = n => "gid://shopify/ProductVariant/" + n;
const product = n => "gid://shopify/Product/" + n;
function line(id, variantId, quantity, price, options={}) {
  return {id:"gid://shopify/CartLine/"+id, quantity,
    sellingPlanAllocation:options.subscription ? {sellingPlan:{id:"gid://shopify/SellingPlan/1"}} : null,
    cost:{amountPerQuantity:{amount:String(price)},subtotalAmount:{amount:String(quantity*price)}},
    merchandise:{__typename:"ProductVariant",id:variant(variantId),product:{id:product(options.product || variantId),inEligibleCollection:!!options.collection}}};
}
function configured(overrides={}) {
  return normalizeConfig({...defaultConfig(),eligibleVariantIds:[variant(1),variant(2)],...overrides});
}
function input(lines, overrides={},rate=1) {
  return {presentmentCurrencyRate:String(rate),cart:{lines},discount:{discountClasses:["PRODUCT"],metafield:{jsonValue:configured(overrides)}}};
}
const candidate = result => result.operations[0].productDiscountsAdd.candidates[0];
const targets = result => candidate(result).targets.map(t=>t.cartLine);
test("three units: only one free",()=>{
  const result=run(input([line(1,1,3,50)]));
  assert.deepEqual(targets(result),[{id:"gid://shopify/CartLine/1",quantity:1}]);
  assert.deepEqual(candidate(result).value,{percentage:{value:"100"}});
});
test("different eligible products: cheapest unit only",()=>{
  const result=run(input([line(1,1,2,80),line(2,2,3,40),line(3,3,1,1)]));
  assert.deepEqual(targets(result),[{id:"gid://shopify/CartLine/2",quantity:1}]);
});
test("cap three is shared across lines",()=>{
  const result=run(input([line(1,1,2,80),line(2,2,2,40)],{maximumQuantity:3}));
  assert.deepEqual(targets(result),[{id:"gid://shopify/CartLine/2",quantity:2},{id:"gid://shopify/CartLine/1",quantity:1}]);
});
test("highest-price priority is configurable",()=>{
  const result=run(input([line(1,1,1,80),line(2,2,1,40)],{priority:"highest_price"}));
  assert.equal(targets(result)[0].id,"gid://shopify/CartLine/1");
});
test("cart order is configurable",()=>{
  const result=run(input([line(1,1,1,80),line(2,2,1,40)],{priority:"cart_order"}));
  assert.equal(targets(result)[0].id,"gid://shopify/CartLine/1");
});
test("percentage is read from configuration",()=>{
  assert.deepEqual(candidate(run(input([line(1,1,1,50)],{value:25}))).value,{percentage:{value:"25"}});
});
test("fixed amount converts from shop currency",()=>{
  assert.deepEqual(candidate(run(input([line(1,1,1,50)],{valueType:"fixed_amount",value:10},2))).value,{fixedAmount:{amount:"20",appliesToEachItem:true}});
});
test("one-time purchases exclude subscriptions",()=>{
  const result=run(input([line(1,1,1,10,{subscription:true}),line(2,2,1,40)]));
  assert.equal(targets(result)[0].id,"gid://shopify/CartLine/2");
});
test("subscription-only purchase type",()=>{
  const result=run(input([line(1,1,1,10),line(2,2,1,40,{subscription:true})],{purchaseType:"subscription"}));
  assert.equal(targets(result)[0].id,"gid://shopify/CartLine/2");
});
test("both purchase types",()=>{
  const result=run(input([line(1,1,1,10,{subscription:true}),line(2,2,1,40)],{purchaseType:"both"}));
  assert.equal(targets(result)[0].id,"gid://shopify/CartLine/1");
});
test("excluded variant of the same product stays excluded",()=>{
  assert.deepEqual(run(input([line(1,99,1,20,{product:1})])),{operations:[]});
});
test("all current and future product variants are supported",()=>{
  const result=run(input([line(1,99,1,20,{product:1})],{eligibleVariantIds:[],eligibleProductIds:[product(1)]}));
  assert.equal(targets(result)[0].id,"gid://shopify/CartLine/1");
});
test("collection membership is supplied by Shopify",()=>{
  const result=run(input([line(1,99,1,20,{collection:true}),line(2,100,1,1)],{appliesTo:"collections",eligibleCollectionIds:["gid://shopify/Collection/1"]}));
  assert.equal(targets(result)[0].id,"gid://shopify/CartLine/1");
});
test("all products mode is configurable",()=>{
  assert.equal(targets(run(input([line(1,99,1,20)],{appliesTo:"all"})))[0].id,"gid://shopify/CartLine/1");
});
test("quantity requirement counts only eligible items",()=>{
  assert.deepEqual(run(input([line(1,1,1,20),line(2,99,10,20)],{minimum:{type:"quantity",value:2}})),{operations:[]});
});
test("quantity requirement can pass without increasing discounted quantity",()=>{
  assert.equal(targets(run(input([line(1,1,3,20)],{minimum:{type:"quantity",value:3}})))[0].quantity,1);
});
test("amount requirement uses store-currency conversion",()=>{
  assert.deepEqual(run(input([line(1,1,1,99)],{minimum:{type:"amount",value:50}},2)),{operations:[]});
  assert.equal(targets(run(input([line(1,1,1,100)],{minimum:{type:"amount",value:50}},2)))[0].quantity,1);
});
test("invalid maximum quantity fails closed",()=>{
  assert.deepEqual(run(input([line(1,1,1,50)],{maximumQuantity:0})),{operations:[]});
});
test("invalid percentage fails closed",()=>{
  assert.deepEqual(run(input([line(1,1,1,50)],{value:101})),{operations:[]});
});
test("missing config and empty cart return no operation",()=>{
  const data=input([]);
  assert.deepEqual(run(data),{operations:[]});
  data.discount.metafield=null;
  assert.deepEqual(run(data),{operations:[]});
});
test("function does not change input data",()=>{
  const data=input([line(1,1,3,50),line(2,2,1,30)]);
  const before=structuredClone(data);
  run(data);
  assert.deepEqual(data,before);
});
test("picker data preserves exact variants",()=>{
  const products=productsFromPicker([{id:product(1),title:"Example",variants:[{id:variant(11),title:"Selected"}]}]);
  const config=normalizeConfig({...defaultConfig(),products});
  assert.deepEqual(config.eligibleVariantIds,[variant(11)]);
  assert.deepEqual(config.eligibleProductIds,[]);
});
test("whole-product checkbox converts targeting to product ID",()=>{
  const products=productsFromPicker([{id:product(1),title:"Example",variants:[{id:variant(11)}]}]);
  products[0].allVariants=true;
  const config=normalizeConfig({...defaultConfig(),products});
  assert.deepEqual(config.eligibleVariantIds,[]);
  assert.deepEqual(config.eligibleProductIds,[product(1)]);
});
test("invalid selections are reported before save",()=>{
  assert.ok(validateConfig(defaultConfig()).products);
  assert.ok(validateConfig(configured({minimum:{type:"quantity",value:1.5}})).minimum);
});
function mockApi() {
  const calls=[];
  const api={calls,discounts:{
    updateDiscountClasses:async value=>(calls.push(["classes",value]),{success:true,value}),
    updatePurchaseType:async value=>(calls.push(["purchase",value]),{success:true,value}),
    updateRecurringCycleLimit:async value=>(calls.push(["cycles",value]),{success:true,value}),
  },applyMetafieldChange:async change=>(calls.push(["metafield",change]),{type:"success"})};
  return api;
}
test("save synchronizes native purchase controls and persistent config",async()=>{
  const api=mockApi();
  await saveConfiguration(api,configured({purchaseType:"subscription",recurringCycleLimit:2,value:50,maximumQuantity:2}));
  assert.deepEqual(api.calls[1],["purchase","subscription"]);
  assert.deepEqual(api.calls[2],["cycles",2]);
  const change=api.calls[3][1];
  assert.equal(change.type,"updateMetafield");
  assert.equal(change.namespace,"$app");
  assert.equal(change.valueType,"json");
  const config=JSON.parse(change.value);
  assert.equal(config.value,50);
  assert.equal(config.maximumQuantity,2);
  assert.equal(config.purchaseType,"subscription");
});
test("save does not rewrite eligibility, combinations or dates",async()=>{
  const api=mockApi();
  await saveConfiguration(api,configured());
  assert.deepEqual(api.calls.map(c=>c[0]),["classes","purchase","cycles","metafield"]);
  const serialized=JSON.parse(api.calls[3][1].value);
  assert.equal(serialized.startsAt,undefined);
  assert.equal(serialized.context,undefined);
  assert.equal(serialized.combinesWith,undefined);
});
test("Shopify native settings failure stops save",async()=>{
  const api=mockApi();
  api.discounts.updatePurchaseType=async()=>({success:false,errors:[{message:"Denied"}]});
  await assert.rejects(()=>saveConfiguration(api,configured()),/Denied/);
  assert.ok(!api.calls.some(c=>c[0]==="metafield"));
});
test("metafield save errors propagate to block native save",async()=>{
  const api=mockApi();
  api.applyMetafieldChange=async()=>({type:"error",message:"Storage unavailable"});
  await assert.rejects(()=>saveConfiguration(api,configured()),/Storage unavailable/);
});
test("invalid settings do not call Shopify",async()=>{
  const api=mockApi();
  await assert.rejects(()=>saveConfiguration(api,configured({maximumQuantity:0})));
  assert.equal(api.calls.length,0);
});
test("legacy variant IDs hydrate to product/variant rows",async()=>{
  const config=configured();
  const api={query:async()=>({data:{nodes:[
    {__typename:"ProductVariant",id:variant(1),title:"A",product:{id:product(10),title:"Product A"}},
    {__typename:"ProductVariant",id:variant(2),title:"B",product:{id:product(10),title:"Product A"}},
  ]}})};
  const hydrated=await hydrateSelections(api,config);
  assert.equal(hydrated.products.length,1);
  assert.equal(hydrated.products[0].variants.length,2);
  assert.equal(hydrated.products[0].allVariants,false);
});
test("unavailable catalog resources fail instead of widening eligibility",async()=>{
  await assert.rejects(()=>hydrateSelections({query:async()=>({data:{nodes:[null]}})},configured()),/unavailable/);
});
