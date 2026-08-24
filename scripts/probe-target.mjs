#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Redsky の呼び出し形を確定させる調査スクリプト。
//
// 分かっていること:
//   ・Origin/Referer を偽装して送ると Akamai に 403 + CAPTCHA で弾かれる
//   ・ヘッダを付けずに送ると Akamai を通過し、GraphQL 層まで到達する
// したがって「ヘッダを付けない + 必要な変数を全部渡す」で通るはず。
//
// GraphQL は足りない変数を名指しでエラーに出すので、それを読んで自動で埋め、
// 通るまで再試行する。最終的に成立したパラメータ一式を出力する。
// -----------------------------------------------------------------------------

const BASE = "https://redsky.target.com/redsky_aggregations/v1/web";
const KEY = process.env.TARGET_REDSKY_KEY || "9f36aeafbe60771e321a7cc95a78140772ab3e96";
const ZIP = "94040";
const STORE = "2775"; // Mountain View (Showers Dr)
const VISITOR = "018F6E2A9C3B0201B12CBDDE38A0AB4D";

// 変数名 → 補う既定値。GraphQL が「この変数が無い」と言ってきたら引く。
const DEFAULTS = {
  visitor_id: VISITOR,
  pricing_store_id: STORE,
  store_id: STORE,
  store_ids: STORE,
  required_store_id: STORE,
  has_required_store_id: "true",
  has_pricing_store_id: "true",
  has_store_positions_store_id: "true",
  store_positions_store_id: STORE,
  channel: "WEB",
  platform: "desktop",
  zip: ZIP,
  state: "CA",
  latitude: "37.40",
  longitude: "-122.08",
  place: ZIP,
  within: "100",
  limit: "6",
  count: "10",
  offset: "0",
  page: "/",
  keyword: "needoh",
  is_bot: "false",
  scheduled_delivery_store_id: STORE,
  paid_membership: "false",
  base_membership: "false",
  card_membership: "false",
  new_cart_checkout: "false",
};

// 足りない変数名を GraphQL のエラーメッセージから抜き出す
function missingVars(json) {
  const out = [];
  for (const e of json?.errors || []) {
    const m = /Variable '([^']+)'/.exec(e.message || "");
    if (m) out.push(m[1]);
  }
  return [...new Set(out)];
}

async function call(endpoint, params, headers) {
  const qs = new URLSearchParams({ key: KEY, ...params }).toString();
  const res = await fetch(`${BASE}/${endpoint}?${qs}`, { headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// 足りない変数を埋めながら、通るまで最大8回試す
async function resolve(endpoint, seed, headers, label) {
  const params = { ...seed };
  for (let i = 0; i < 8; i++) {
    const r = await call(endpoint, params, headers);
    if (r.status === 403 || /captcha/i.test(r.text)) {
      console.log(`❌ ${label}: HTTP ${r.status} — Akamai にブロック`);
      console.log(`   ${r.text.slice(0, 120)}`);
      return null;
    }
    const missing = r.json ? missingVars(r.json) : [];
    if (r.json && !r.json.errors) {
      console.log(`✅ ${label}: HTTP ${r.status} — 成功`);
      return { params, json: r.json };
    }
    if (!missing.length) {
      console.log(`❌ ${label}: HTTP ${r.status} — 未知のエラー`);
      console.log(`   ${r.text.slice(0, 300)}`);
      return null;
    }
    const added = [];
    for (const v of missing) {
      if (DEFAULTS[v] === undefined) {
        console.log(`❌ ${label}: 変数 '${v}' の既定値が不明。手当てが必要。`);
        return null;
      }
      params[v] = DEFAULTS[v];
      added.push(v);
    }
    console.log(`   ${label}: 変数を追加 → ${added.join(", ")}`);
  }
  console.log(`❌ ${label}: 8回試しても収束せず`);
  return null;
}

// ヘッダ2パターンで比較する。偽装 Origin が原因なら差が出る。
const HEADER_SETS = [
  { name: "ヘッダ無し", headers: {} },
  { name: "Accept のみ", headers: { Accept: "application/json" } },
];

for (const hs of HEADER_SETS) {
  console.log(`\n===== ${hs.name} =====`);

  const stores = await resolve("nearby_stores_v1",
    { place: ZIP, within: "100", limit: "6", channel: "WEB" }, hs.headers, "店舗検索");
  if (stores) {
    const list = stores.json?.data?.nearby_stores?.stores || [];
    console.log(`   → ${list.length}件: ${list.slice(0, 3).map(s => `${s.store_id} ${s.location_name}`).join(" / ")}`);
  }

  const search = await resolve("plp_search_v2",
    { keyword: "needoh", channel: "WEB", count: "10", offset: "0", page: "/s/needoh" },
    hs.headers, "キーワード検索(needoh)");
  let tcin = null;
  if (search) {
    const prods = search.json?.data?.search?.products || [];
    console.log(`   → ${prods.length}件`);
    for (const p of prods.slice(0, 4)) {
      console.log(`      tcin=${p.tcin} dpci=${p.item?.dpci} ${p.item?.product_description?.title?.slice(0, 45)}`);
    }
    tcin = prods[0]?.tcin || null;
  }

  const dpci = await resolve("plp_search_v2",
    { keyword: "086-03-3602", channel: "WEB", count: "5", offset: "0", page: "/s/086-03-3602" },
    hs.headers, "DPCI検索(086-03-3602)");
  if (dpci) {
    const prods = dpci.json?.data?.search?.products || [];
    console.log(`   → ${prods.length}件`);
    for (const p of prods.slice(0, 3)) {
      console.log(`      tcin=${p.tcin} dpci=${p.item?.dpci} ${p.item?.product_description?.title?.slice(0, 45)}`);
    }
  }

  if (tcin) {
    const pdp = await resolve("pdp_client_v1",
      { tcin, channel: "WEB", page: `/p/A-${tcin}` }, hs.headers, `商品詳細(tcin=${tcin})`);
    if (pdp) {
      const p = pdp.json?.data?.product;
      console.log(`   → ${p?.item?.product_description?.title?.slice(0, 50)}`);
      console.log(`      street_date=${p?.item?.street_date ?? "なし"} price=${p?.price?.formatted_current_price ?? "なし"}`);
      console.log(`      成立したパラメータ: ${Object.keys(pdp.params).join(", ")}`);
    }
  }
}

// --- 店舗在庫(fulfillment)の応答構造を確認する -------------------------------
// state 上で storeStatus が全件 null になっているため、
// pdp_fulfillment_v1 が本当にデータを返しているのかを実測する。
console.log("\n===== fulfillment 構造確認 =====");
{
  const TCIN = "94619823"; // NeeDoh Fuzz Ball（解決済みの実在 TCIN）
  const r = await resolve("pdp_fulfillment_v1",
    { tcin: TCIN, channel: "WEB", page: `/p/A-${TCIN}` }, {}, `在庫(tcin=${TCIN})`);
  if (r) {
    const ful = gp(r.json, "data.product.fulfillment");
    console.log("   成立パラメータ:", Object.keys(r.params).join(", "));
    console.log("   data.product のキー:", Object.keys(gp(r.json, "data.product") || {}).join(", "));
    console.log("   fulfillment:", ful ? Object.keys(ful).join(", ") : "なし");
    const so = ful?.store_options;
    console.log("   store_options:", Array.isArray(so) ? `${so.length}件` : typeof so);
    if (Array.isArray(so) && so.length) {
      console.log("   store_options[0]:", JSON.stringify(so[0]).slice(0, 600));
    }
    if (ful) console.log("   fulfillment 全体(先頭800字):", JSON.stringify(ful).slice(0, 800));
  }
}
