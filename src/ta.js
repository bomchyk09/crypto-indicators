// Технічний аналіз однієї монети з уже порахованих індикаторів (engine.js).
// Опис стану і рівнів + умовні сценарії («якщо… то…»), без прогнозу ціни.
// Надійність окремих сигналів — з бектесту (backtest/report.json), якщо він доступний.

const fmtN = x => {
  if (x == null || !isFinite(x)) return "–";
  const a = Math.abs(x), d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  return x.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: d });
};
const pct = (a, b) => (a / b - 1) * 100;
const sgnTxt = x => (x > 0 ? "+" : "") + x.toFixed(1).replace(".", ",") + " %";

// Свінгові максимуми/мінімуми (фрактал ±3 свічки) за останні W закритих свічок
function swings(d, i, W = 120, k = 3) {
  const hi = [], lo = [];
  for (let j = Math.max(k, i - W); j <= i - k; j++) {
    let isH = true, isL = true;
    for (let m = 1; m <= k; m++) {
      if (d.h[j] <= d.h[j - m] || d.h[j] < d.h[j + m]) isH = false;
      if (d.l[j] >= d.l[j - m] || d.l[j] > d.l[j + m]) isL = false;
    }
    if (isH) hi.push(d.h[j]);
    if (isL) lo.push(d.l[j]);
  }
  return { hi, lo };
}

// Збір рівнів з різних джерел, злиття близьких (≤ 1,5 %) у зони
function levels(R, d, i) {
  const c = d.c[i], L = [];
  const add = (v, src) => { if (isFinite(v) && v > 0) L.push({ v, src }); };
  const s = swings(d, i);
  s.hi.forEach(v => add(v, v > c ? "свінг-максимум" : "колишній свінг-максимум")); s.lo.forEach(v => add(v, v < c ? "свінг-мінімум" : "колишній свінг-мінімум"));
  add(R.sma50[i], "SMA50"); add(R.sma200[i], "SMA200"); add(R.ema21[i], "EMA21");
  add(R.donHi[i], "максимум 20 д"); add(R.donLo[i], "мінімум 20 д");
  add(R.fib.f382, "Фібоначчі 38,2 %"); add(R.fib.f5, "Фібоначчі 50 %"); add(R.fib.f618, "Фібоначчі 61,8 %");
  add(R.vp.poc, "POC (макс. обсяг 90 д)"); add(R.pivot.R1, "Pivot R1"); add(R.pivot.S1, "Pivot S1");
  add(R.supertrend[i], "Supertrend"); add(R.kijun[i], "Kijun (Ішимоку)");
  L.sort((a, b) => a.v - b.v);
  const zones = [];
  for (const x of L) {
    const z = zones[zones.length - 1];
    if (z && x.v / z.lo - 1 <= 0.015) { z.hi = x.v; z.src.add(x.src); z.n++; z.sum += x.v; }
    else zones.push({ lo: x.v, hi: x.v, src: new Set([x.src]), n: 1, sum: x.v });
  }
  const out = zones.map(z => ({ price: z.sum / z.n, strength: z.src.size, src: [...z.src] }));
  const sup = out.filter(z => z.price < c * 0.995).sort((a, b) => b.price - a.price).slice(0, 3);
  const res = out.filter(z => z.price > c * 1.005).sort((a, b) => a.price - b.price).slice(0, 3);
  return { sup, res };
}

function analyze(sym, R, d, i, bt) {
  const c = d.c[i], f = fmtN;
  const rel = key => { const v = bt?.[key]; return v ? ` [перевірка на історії: ${v}]` : ""; };
  // ТРЕНД
  const above200 = c > R.sma200[i], gc = R.sma50[i] > R.sma200[i], st = R.stDir[i] > 0, adx = R.adx[i];
  const strength = adx > 40 ? "дуже сильний" : adx > 25 ? "сильний" : adx > 20 ? "помірний" : "слабкий (боковик)";
  const cTop = Math.max(R.spanA[i], R.spanB[i]), cBot = Math.min(R.spanA[i], R.spanB[i]);
  const cloudS = c > cTop ? 1 : c < cBot ? -1 : 0;
  // Тренд — за 4 швидшими ознаками (ціна vs SMA200, ціна vs SMA50, Supertrend, хмара); перетин SMA50/200 — лише примітка (запізнюється)
  const tDir = (above200 ? 1 : -1) + (c > R.sma50[i] ? 1 : -1) + (st ? 1 : -1) + cloudS;
  const trend = tDir >= 3 ? "висхідний" : tDir <= -3 ? "низхідний" : "невизначений (змішані ознаки)";
  const cloud = cloudS > 0 ? "над хмарою Ішимоку" : cloudS < 0 ? "під хмарою Ішимоку" : "у хмарі Ішимоку";
  const crossLag = (gc && tDir <= -3) || (!gc && tDir >= 3) ? " — ще не відреагував, бо запізнюється" : "";
  const trendTxt = `${trend}, ${strength} (ADX ${f(adx)}). Ціна ${sgnTxt(pct(c, R.sma200[i]))} від SMA200 (${f(R.sma200[i])}); ціна ${c > R.sma50[i] ? "вище" : "нижче"} SMA50 (${f(R.sma50[i])}); SMA50 ${gc ? "вище" : "нижче"} SMA200 (${gc ? "золотий хрест" : "хрест смерті"}${crossLag}); Supertrend — ${st ? "лонг" : "шорт"} (лінія ${f(R.supertrend[i])}); ${cloud}.`;
  // ІМПУЛЬС
  const rsi = R.rsi[i], h = R.macdHist[i], hPrev = R.macdHist[i - 1];
  const rsiTxt = rsi > 70 ? `RSI ${f(rsi)} — перекупленість; на крипторинку це частіше ознака сили, ніж розвороту${rel("rsi_enter_overbought")}`
    : rsi < 30 ? `RSI ${f(rsi)} — перепроданість${rel("rsi_enter_oversold")}`
    : rsi > 55 ? `RSI ${f(rsi)} — імпульс на боці покупців` : rsi < 45 ? `RSI ${f(rsi)} — імпульс на боці продавців` : `RSI ${f(rsi)} — нейтрально`;
  const macdTxt = `MACD ${h >= 0 ? "вище" : "нижче"} сигнальної, гістограма ${Math.abs(h) < Math.abs(hPrev) ? "слабшає" : "посилюється"}`;
  const r = k => (i >= k ? c / d.c[i - k] - 1 : NaN);
  const ts = `зміна за 1 / 4 / 12 тижнів: ${[7, 28, 84].map(k => sgnTxt(r(k) * 100)).join(" / ")}`;
  const div = R.div !== "немає" ? `; ${R.div} дивергенція RSI` : "";
  const momTxt = `${rsiTxt}. ${macdTxt}; ${ts}${div}.`;
  // ОБСЯГ
  const cmf = R.cmf[i], obv20 = R.obv[i] - R.obv[i - 20], vr = R.volRatio[i];
  const volTxt = `CMF ${f(cmf)} (${cmf > 0.05 ? "приплив грошей" : cmf < -0.05 ? "відплив грошей" : "нейтрально"}); OBV за 20 днів ${obv20 > 0 ? "зростає (накопичення)" : "падає (розподіл)"}; MFI ${f(R.mfi[i])}; обсяг дня — ${f(vr)}× від середнього${vr >= 2 ? " (сплеск)" : ""}; VWAP 20 д ${f(R.vwap20[i])} — ціна ${c > R.vwap20[i] ? "вище" : "нижче"}.`;
  // ВОЛАТИЛЬНІСТЬ
  const w = R.bbWidth.slice(Math.max(0, i - 89), i + 1).filter(isFinite), wp = w.filter(x => x <= R.bbWidth[i]).length / w.length * 100;
  const atrP = R.atrPct[i];
  const vLevel = wp >= 80 ? "висока" : wp <= 20 ? "низька (стиснення — можливий сильний рух у будь-який бік)" : "середня";
  const vTxt = `${vLevel}: ATR ${f(R.atr[i])} (${f(atrP)} % ціни за день); ширина смуг Боллінджера ${f(R.bbWidth[i])} % — ${Math.round(wp)}-й процентиль за 90 днів; ціна в смугах на ${f(R.bbPctB[i] * 100)} % (0 — нижня, 100 — верхня).`;
  // РІВНІ
  const lv = levels(R, d, i);
  const lvTxt = (arr) => arr.length ? arr.map(z => `${f(z.price)} (${z.src.join(" + ")})`).join("; ") : "немає поруч";
  // ЗВЕДЕНО + СЦЕНАРІЇ (умовні)
  const comp = R.comp[i], state = R.compState[i];
  const s1 = lv.sup[0], s2 = lv.sup[1], r1 = lv.res[0], r2 = lv.res[1];
  const stopL = c - 2 * R.atr[i], stopS = c + 2 * R.atr[i];
  const bull = r1 ? `закриття дня вище ${f(r1.price)}${r2 ? ` → наступний опір ${f(r2.price)}` : ""}` : "оновлення максимуму 20 днів";
  const bear = s1 ? `закриття дня нижче ${f(s1.price)}${s2 ? ` → наступна підтримка ${f(s2.price)}` : ""}` : "оновлення мінімуму 20 днів";
  const flip = st ? `тренд (Supertrend) зламається при закритті нижче ${f(R.supertrend[i])}` : `тренд (Supertrend) зміниться на висхідний при закритті вище ${f(R.supertrend[i])}`;
  const summary = `${sym}: ${state.toUpperCase()} стан (зведена оцінка ${comp > 0 ? "+" : ""}${comp} з ±6). Тренд ${trend.split(" (")[0]}, ${strength}; ${rsi > 55 ? "імпульс за покупцями" : rsi < 45 ? "імпульс за продавцями" : "імпульс нейтральний"}; волатильність ${vLevel.split(" ")[0]}.`;
  return {
    summary, state, composite: comp,
    trend: trendTxt, momentum: momTxt, volume: volTxt, volatility: vTxt,
    supports: lv.sup.map(z => ({ price: +z.price.toPrecision(6), sources: z.src })), resistances: lv.res.map(z => ({ price: +z.price.toPrecision(6), sources: z.src })),
    levels_text: { support: lvTxt(lv.sup), resistance: lvTxt(lv.res) },
    scenarios: {
      bullish: `Бичачий сценарій: ${bull}.`,
      bearish: `Ведмежий сценарій: ${bear}.`,
      trend_flip: `Зміна тренду: ${flip}.`,
      risk: `Ризик за ATR: стоп для лонгу ≈ ${f(stopL)} (−2 ATR, ${sgnTxt(pct(stopL, c))}), для шорту ≈ ${f(stopS)} (+2 ATR).`,
    },
    note: "Технічний аналіз описує поточний стан і рівні; сценарії умовні («якщо… то…»), це не прогноз і не порада.",
  };
}

module.exports = { analyze };
