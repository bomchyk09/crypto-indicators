// Перевірка стратегії входів/виходів (docs/js/strategy.js) на історії по всіх монетах і таймфреймах 1h / 4h / 1d.
// Результат: backtest/strategy.json і backtest/strategy.md. Лише публічні дані, без ключів і без торгівлі.
const fs = require("fs");
const path = require("path");
const IND = require("./engine.js");
const S = require("../docs/js/strategy.js");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "backtest"); fs.mkdirSync(OUT, { recursive: true });
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const TF = { "1h": 3600e3, "4h": 4 * 3600e3, "1d": 864e5 }, HTF = { "1h": "4h", "4h": "1d", "1d": null };
const LIMIT = { "1h": 1000, "4h": 1000, "1d": 1000 };

async function klines(sym, tf, limit, startTime) {
  const u = `https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=${limit}` + (startTime ? `&startTime=${startTime}` : "");
  const r = await fetch(u); if (!r.ok) throw new Error(`${tf} HTTP ${r.status}`);
  const k = await r.json(); k.pop(); // остання формується
  return { t: k.map(x => x[0]), o: k.map(x => +x[1]), h: k.map(x => +x[2]), l: k.map(x => +x[3]), c: k.map(x => +x[4]), v: k.map(x => +x[7]) };
}
// Для 1d — уся історія (кілька сторінок), для 1h/4h — останні 1000 свічок
async function series(sym, tf) {
  if (tf !== "1d") return klines(sym, tf, LIMIT[tf]);
  const all = { t: [], o: [], h: [], l: [], c: [], v: [] }; let st = Date.UTC(2017, 0, 1);
  for (let p = 0; p < 6; p++) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&limit=1000&startTime=${st}`);
    const k = await r.json(); if (!Array.isArray(k) || !k.length) break;
    for (const x of k) { all.t.push(x[0]); all.o.push(+x[1]); all.h.push(+x[2]); all.l.push(+x[3]); all.c.push(+x[4]); all.v.push(+x[7]); }
    if (k.length < 1000) break; st = k[k.length - 1][0] + 864e5;
  }
  for (const key in all) all[key].pop();
  return all;
}

(async () => {
  const res = { generated_utc: new Date().toISOString(), rules: "вхід: оцінка перетинає ±3 + старший ТФ згоден; стоп 2 ATR (1R); ціль 1 = 1R (половина, стоп у беззбиток); ціль 2 = 3R; вихід за розворотом Supertrend або оцінки через 0; комісія 0,1 % за угоду", tf: {}, coins: {}, errors: [] };
  const allTrades = { "1h": [], "4h": [], "1d": [] }, buyHold = { "1h": [], "4h": [], "1d": [] };
  for (const sym of CFG.assets) {
    try {
      const data = {};
      for (const tf of ["1d", "4h", "1h"]) { data[tf] = await series(sym, tf); await new Promise(r => setTimeout(r, 250)); }
      const R = {}; for (const tf in data) { R[tf] = IND.all(data[tf]); }
      res.coins[sym] = {};
      for (const tf of ["1h", "4h", "1d"]) {
        const d = data[tf], h = HTF[tf];
        const htfComp = h ? S.alignHTF(d.t, TF[tf], { t: data[h].t, comp: R[h].comp, ms: TF[h] }) : null;
        const out = S.run(d, R[tf], htfComp);
        allTrades[tf].push(...out.trades.map(t => ({ ...t, sym })));
        const from = d.t[201], to = d.t[d.t.length - 1];
        res.coins[sym][tf] = { from: new Date(from).toISOString().slice(0, 10), to: new Date(to).toISOString().slice(0, 10), ...out.stats.all, long: out.stats.long, short: out.stats.short };
        buyHold[tf].push(d.c[d.c.length - 1] / d.c[201] - 1);
      }
    } catch (e) { res.errors.push(`${sym}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 400));
  }
  for (const tf of ["1h", "4h", "1d"]) {
    const st = S.stats(allTrades[tf]);
    const recent = S.stats(allTrades[tf].filter(t => t.tIn >= Date.now() - 365 * 864e5));
    res.tf[tf] = { all: st.all, long: st.long, short: st.short, last365: recent.all, coins: buyHold[tf].length, buy_hold_median_pct: +(buyHold[tf].sort((a, b) => a - b)[Math.floor(buyHold[tf].length / 2)] * 100).toFixed(1) };
  }
  fs.writeFileSync(path.join(OUT, "strategy.json"), JSON.stringify(res, null, 1));
  const f = x => (x == null ? "—" : String(x).replace(".", ","));
  let md = `# Перевірка стратегії входів і виходів на історії\n\n${res.generated_utc.slice(0, 16).replace("T", " ")} UTC · ${CFG.assets.length} монет · Binance. Правила: ${res.rules}.\n\n`;
  md += `«Середній R» — середній результат угоди в кратних ризику (1R = відстань до стопу). Додатний середній R після комісій = стратегія мала перевагу на історії. Не гарантія майбутнього.\n\n`;
  md += `| ТФ | Угод | Виграшних, % | Середній R | Сума R | Profit factor | Макс. просідання, R | Лонги: n / сер. R | Шорти: n / сер. R | Останні 365 д: n / сер. R |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const tf of ["1h", "4h", "1d"]) { const x = res.tf[tf]; md += `| ${tf} | ${x.all.n} | ${f(x.all.win)} | ${f(x.all.avgR)} | ${f(x.all.totalR)} | ${f(x.all.pf)} | ${f(x.all.maxDDR)} | ${x.long.n} / ${f(x.long.avgR)} | ${x.short.n} / ${f(x.short.avgR)} | ${x.last365.n} / ${f(x.last365.avgR)} |\n`; }
  md += `\nПеріоди: 1h — останні ~41 день, 4h — ~166 днів, 1d — уся історія монети. На 1h і 4h мало угод на монету — висновки по окремій монеті ненадійні.\n\n## По монетах (сер. R, кількість угод)\n\n| Монета | 1h | 4h | 1d |\n|---|---|---|---|\n`;
  for (const [s, v] of Object.entries(res.coins)) md += `| ${s} | ${f(v["1h"]?.avgR)} (${v["1h"]?.n ?? 0}) | ${f(v["4h"]?.avgR)} (${v["4h"]?.n ?? 0}) | ${f(v["1d"]?.avgR)} (${v["1d"]?.n ?? 0}) |\n`;
  md += `\nПомилки: ${res.errors.length ? res.errors.join("; ") : "немає"}.\n`;
  fs.writeFileSync(path.join(OUT, "strategy.md"), md);
  console.log(JSON.stringify(res.tf, null, 1)); if (res.errors.length) console.log(res.errors.join("\n"));
})();
