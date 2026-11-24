// Живі сетапи за правилами docs/js/strategy.js (ті самі, що на сайті) по всіх монетах і ТФ 1h / 4h / 1d.
// Порівнює з попереднім запуском: нові входи, виходи (з результатом у R), відкриті позиції.
// Пише data/setups.json, data/setups_state.json, дописує data/setups_journal.csv. Лише публічні дані, без торгівлі.
const fs = require("fs");
const path = require("path");
const IND = require("./engine.js");
const S = require("../docs/js/strategy.js");
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data"); fs.mkdirSync(DATA, { recursive: true });
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const TF = { "1h": 3600e3, "4h": 4 * 3600e3, "1d": 864e5 }, HTF = { "1h": "4h", "4h": "1d", "1d": null };
const r = (x, n = 6) => (x == null || !isFinite(x) ? null : +(+x).toPrecision(n));
const iso = t => new Date(t).toISOString().slice(0, 16).replace("T", " ");

async function klines(sym, tf) {
  const u = `https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=1000`;
  const res = await fetch(u, { headers: { "User-Agent": "crypto-indicators-bot" } });
  if (!res.ok) throw new Error(`${tf} HTTP ${res.status}`);
  const k = await res.json();
  return { t: k.map(x => x[0]), o: k.map(x => +x[1]), h: k.map(x => +x[2]), l: k.map(x => +x[3]), c: k.map(x => +x[4]), v: k.map(x => +x[7]) };
}
async function fng() {
  try {
    const j = await (await fetch("https://api.alternative.me/fng/?limit=8")).json();
    const d = j.data.map(x => ({ value: +x.value, label: x.value_classification, date: new Date(+x.timestamp * 1000).toISOString().slice(0, 10) }));
    return { now: d[0], week_ago: d[7] || null, source: "alternative.me" };
  } catch (e) { return { error: e.message }; }
}

(async () => {
  const statePath = path.join(DATA, "setups_state.json");
  const prev = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null;
  let edge = {};
  try { edge = JSON.parse(fs.readFileSync(path.join(DATA, "strategy_bt.json"), "utf8")); } catch {}
  const out = {
    generated_utc: new Date().toISOString(),
    rules: "вхід: оцінка перетинає ±3 + старший ТФ згоден (1h→4h, 4h→1d); стоп 2 ATR (1R); ціль 1 = 1R (половина, стоп у беззбиток); ціль 2 = 3R; вихід — розворот Supertrend або оцінка через 0",
    reliability: "Перевага на історії: 1d — так (невелика), 1h — ≈ 0, 4h — ні. Див. гілку backtest/strategy.md.",
    fear_greed: await fng(),
    events: [], open: [], coins: {}, errors: [],
  };
  const state = {}, journal = [];
  for (const sym of CFG.assets.map(x => (typeof x === "string" ? x : x.symbol))) {
    try {
      const d = {}; for (const tf of ["1d", "4h", "1h"]) { d[tf] = await klines(sym, tf); await new Promise(z => setTimeout(z, 150)); }
      const R = {}; for (const tf in d) R[tf] = IND.all(d[tf]);
      out.coins[sym] = {};
      for (const tf of ["1h", "4h", "1d"]) {
        const x = d[tf], N = x.c.length - 1, h = HTF[tf];
        const htf = h ? S.alignHTF(x.t, TF[tf], { t: d[h].t, comp: R[h].comp, ms: TF[h] }) : null;
        const res = S.run(x, R[tf], htf, N - 1);
        const cur = S.current(x, R[tf], htf, res, N - 1);
        const o = res.open;
        const key = `${sym}|${tf}`;
        state[key] = o ? { side: o.side, tIn: o.tIn } : null;
        const bt = edge.coins?.[sym]?.[tf];
        const info = {
          state: cur.kind, title: cur.title, price: r(x.c[N]), composite: R[tf].comp[N - 1], htf_composite: htf ? htf[N - 1] : null,
          bt_coin: bt ? { n: bt.n, win: bt.win, avgR: bt.avgR } : null,
        };
        if (o) Object.assign(info, { side: o.side > 0 ? "лонг" : "шорт", entry: r(o.pIn), stop: r(o.stop), t1: r(o.t1), t2: r(o.t2), half_taken: !!o.half, r_now: o.rNow, entered_utc: iso(o.tIn) });
        out.coins[sym][tf] = info;
        if (o) out.open.push({ asset: sym, tf, ...info });
        if (prev) {
          const p = prev[key];
          if (o && (!p || p.tIn !== o.tIn)) {
            const ev = { kind: "вхід", asset: sym, tf, side: info.side, entry: info.entry, stop: info.stop, t1: info.t1, t2: info.t2, candle_utc: iso(o.tIn) };
            out.events.push(ev); journal.push([out.generated_utc, sym, tf, "вхід", info.side, ev.entry, ev.stop, ev.t1, ev.t2, "", ev.candle_utc].join(";"));
          }
          if (p && (!o || p.tIn !== o.tIn)) {
            const t = res.trades.find(z => z.tIn === p.tIn);
            const ev = { kind: "вихід", asset: sym, tf, side: p.side > 0 ? "лонг" : "шорт", exit: t ? r(t.pOut) : null, why: t ? t.why : "невідомо (історія зсунулась)", r: t ? t.r : null, candle_utc: t ? iso(t.tOut) : null };
            out.events.push(ev); journal.push([out.generated_utc, sym, tf, "вихід", ev.side, "", "", "", "", ev.r ?? "", ev.candle_utc ?? ""].join(";"));
          }
        }
      }
    } catch (e) {
      out.errors.push(`${sym}: ${e.message}`);
      if (prev) for (const tf of ["1h", "4h", "1d"]) state[`${sym}|${tf}`] = prev[`${sym}|${tf}`] ?? null;
    }
  }
  if (!prev) out.note = "Перший запуск: базовий стан записано, події з'являться з наступного запуску.";
  fs.writeFileSync(statePath, JSON.stringify(state));
  fs.writeFileSync(path.join(DATA, "setups.json"), JSON.stringify(out, null, 1));
  const jp = path.join(DATA, "setups_journal.csv");
  if (!fs.existsSync(jp)) fs.writeFileSync(jp, "run_utc;asset;tf;event;side;entry;stop;t1;t2;r;candle_utc\n");
  if (journal.length) fs.appendFileSync(jp, journal.join("\n") + "\n");
  // Короткий звіт для людини
  const f = x => (x == null ? "–" : String(x).replace(".", ","));
  let md = `# Сетапи за правилами — ${out.generated_utc.slice(0, 16).replace("T", " ")} UTC\n\n${out.reliability}\n\n`;
  if (out.fear_greed.now) md += `Індекс страху та жадібності: **${out.fear_greed.now.value}** (${out.fear_greed.now.label}), тиждень тому ${out.fear_greed.week_ago?.value ?? "–"}.\n\n`;
  md += `## Події з минулого запуску (${out.events.length})\n\n` + (out.events.length ? out.events.map(e => e.kind === "вхід" ? `- 🟦 **${e.asset} ${e.tf} — вхід ${e.side}** ${f(e.entry)}; стоп ${f(e.stop)}; ціль 1 ${f(e.t1)}; ціль 2 ${f(e.t2)} (свічка ${e.candle_utc} UTC)` : `- ⬜ **${e.asset} ${e.tf} — вихід ${e.side}**: ${e.why}, ${e.r != null ? (e.r > 0 ? "+" : "") + f(e.r) + "R" : "–"}`).join("\n") : "- немає") + "\n\n";
  md += `## Відкриті позиції за правилами (${out.open.length})\n\n| Монета | ТФ | Бік | Вхід | Стоп | Ціль 1 | Ціль 2 | Зараз, R | Ця монета/ТФ на історії: угод, сер. R |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const o of out.open.sort((a, b) => ["1d", "4h", "1h"].indexOf(a.tf) - ["1d", "4h", "1h"].indexOf(b.tf))) md += `| ${o.asset} | ${o.tf} | ${o.side} | ${f(o.entry)} | ${f(o.stop)}${o.half_taken ? " (б/з)" : ""} | ${f(o.t1)} | ${f(o.t2)} | ${f(o.r_now)} | ${o.bt_coin ? `${o.bt_coin.n}, ${f(o.bt_coin.avgR)}` : "–"} |\n`;
  md += `\nПомилки: ${out.errors.length ? out.errors.join("; ") : "немає"}.\n`;
  fs.writeFileSync(path.join(DATA, "setups.md"), md);
  console.log(`events ${out.events.length}, open ${out.open.length}, errors ${out.errors.length}`);
  if (!Object.keys(out.coins).length) process.exit(1);
})();
