#!/usr/bin/env node
// Target への到達経路を GitHub Actions ランナーから実測する調査用スクリプト。
// Redsky が 403 になることは確認済みなので、他に通る道があるかを一通り試す。
// 通る経路が1つでもあれば、それを本番の取得経路に採用できる。

const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96";

const BROWSERISH = {
  "User-Agent": UA_DESKTOP,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

const probes = [
  {
    name: "redsky nearby_stores (現行)",
    url: `https://redsky.target.com/redsky_aggregations/v1/web/nearby_stores_v1?key=${KEY}&limit=3&within=100&place=94040&channel=WEB`,
    headers: { "User-Agent": UA_DESKTOP, Accept: "application/json", Origin: "https://www.target.com", Referer: "https://www.target.com/" },
  },
  {
    name: "redsky search (モバイルUA)",
    url: `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?key=${KEY}&keyword=needoh&channel=WEB&count=2&page=/s/needoh`,
    headers: { "User-Agent": UA_MOBILE, Accept: "application/json", Origin: "https://www.target.com", Referer: "https://www.target.com/" },
  },
  {
    name: "redsky search (ヘッダ最小)",
    url: `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?key=${KEY}&keyword=needoh&channel=WEB&count=2&page=/s/needoh`,
    headers: {},
  },
  {
    name: "www.target.com 検索HTML",
    url: "https://www.target.com/s?searchTerm=needoh",
    headers: BROWSERISH,
  },
  {
    name: "www.target.com DPCI検索HTML",
    url: "https://www.target.com/s?searchTerm=086-03-3602",
    headers: BROWSERISH,
  },
  {
    name: "target.com トップ (到達性の基準)",
    url: "https://www.target.com/",
    headers: BROWSERISH,
  },
];

for (const p of probes) {
  const t0 = Date.now();
  try {
    const res = await fetch(p.url, { headers: p.headers, redirect: "follow" });
    const body = await res.text();
    const ms = Date.now() - t0;
    // HTML なら、埋め込みJSONに商品データが入っているかを確認する
    const hasTcin = /"tcin"\s*:\s*"?\d{6,}/.test(body);
    const hasDpci = /"dpci"\s*:\s*"?\d{3}-?\d{2}-?\d{4}/.test(body);
    const blocked = /Access Denied|Reference #|akamai|bot|captcha/i.test(body.slice(0, 2000));
    console.log(
      `${res.ok ? "✅" : "❌"} ${p.name}\n` +
      `   HTTP ${res.status} ${ms}ms  ${body.length}B` +
      `  tcin:${hasTcin ? "有" : "無"} dpci:${hasDpci ? "有" : "無"}` +
      `${blocked ? "  ⛔ブロック文言" : ""}\n` +
      `   先頭: ${body.slice(0, 140).replace(/\s+/g, " ")}`
    );
  } catch (e) {
    console.log(`❌ ${p.name}\n   例外: ${e.message}`);
  }
}
