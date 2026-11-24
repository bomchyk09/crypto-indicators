// Стратегія входів і виходів + перевірка на історії (ті самі правила в боті й на живому графіку).
// Правила (закриті свічки, без підглядання вперед):
//  ВХІД ЛОНГ:  зведена оцінка перетинає +3 знизу (comp[i] ≥ 3, comp[i-1] < 3) і старший таймфрейм не ведмежий (його оцінка ≥ 0).
//  ВХІД ШОРТ:  дзеркально (comp ≤ −3, старший ТФ ≤ 0).
//  Ціна входу — закриття сигнальної свічки. Ризик R = 2 × ATR. Стоп = вхід ∓ 1R.
//  Ціль 1 = 1R: закрити половину, стоп перенести в беззбиток. Ціль 2 = 3R: закрити решту.
//  Достроковий вихід решти: Supertrend розвертається проти позиції або оцінка перетинає 0 проти позиції.
//  Якщо в одній свічці досяжні і стоп, і ціль — рахуємо стоп (песимістично). Комісія 0,1 % за кожну угоду (вхід і вихід).
//  Одна позиція одночасно. Результат — у R (кратних ризику).
(function (root) {
  const FEE = 0.001;

  // Індекс останньої ЗАКРИТОЇ свічки старшого ТФ на момент закриття свічки i молодшого ТФ
  function alignHTF(ltfT, ltfMs, htf) {
    if (!htf) return null;
    const out = new Array(ltfT.length).fill(NaN); let k = -1;
    for (let i = 0; i < ltfT.length; i++) {
      const closeT = ltfT[i] + ltfMs;
      while (k + 1 < htf.t.length && htf.t[k + 1] + htf.ms <= closeT) k++;
      out[i] = k >= 0 ? htf.comp[k] : NaN;
    }
    return out;
  }

  function run(d, R, htfComp, lastIdx) {
    const N = lastIdx ?? d.c.length - 1; // остання закрита свічка
    const trades = []; let pos = null;
    for (let i = 201; i <= N; i++) {
      if (pos) {
        const hi = d.h[i], lo = d.l[i], c = d.c[i], s = pos.side;
        const hitStop = s > 0 ? lo <= pos.stop : hi >= pos.stop;
        const hitT1 = !pos.half && (s > 0 ? hi >= pos.t1 : lo <= pos.t1);
        const hitT2 = s > 0 ? hi >= pos.t2 : lo <= pos.t2;
        const rOf = p => s * (p - pos.entry) / pos.risk;
        const close = (p, frac, why) => { pos.realized += frac * rOf(p); pos.left -= frac; if (pos.left <= 1e-9) { finish(i, p, why); } };
        const finish = (j, p, why) => {
          const feeR = (FEE * pos.entry + FEE * p) / pos.risk;
          trades.push({ side: s, iIn: pos.i, tIn: d.t[pos.i], pIn: pos.entry, stop0: pos.stop0, t1: pos.t1, t2: pos.t2, iOut: j, tOut: d.t[j], pOut: p, r: +(pos.realized - feeR).toFixed(3), why });
          pos = null;
        };
        if (hitStop) { close(pos.stop, pos.left, pos.half ? "стоп у беззбитку" : "стоп"); continue; }
        if (hitT1) { close(pos.t1, 0.5, "ціль 1"); pos && (pos.half = true, pos.stop = pos.entry); }
        if (pos && hitT2) { close(pos.t2, pos.left, "ціль 2"); continue; }
        if (pos) {
          const flip = s > 0 ? (R.stDir[i] < 0 || R.comp[i] < 0) : (R.stDir[i] > 0 || R.comp[i] > 0);
          if (flip) close(c, pos.left, "розворот тренду");
        }
        continue;
      }
      const okH = v => htfComp == null || !isFinite(htfComp[i]) ? htfComp == null : v(htfComp[i]);
      const longSig = R.comp[i] >= 3 && R.comp[i - 1] < 3 && okH(x => x >= 0);
      const shortSig = R.comp[i] <= -3 && R.comp[i - 1] > -3 && okH(x => x <= 0);
      if ((longSig || shortSig) && isFinite(R.atr[i]) && R.atr[i] > 0) {
        const s = longSig ? 1 : -1, e = d.c[i], risk = 2 * R.atr[i];
        pos = { side: s, i, entry: e, risk, stop: e - s * risk, stop0: e - s * risk, t1: e + s * risk, t2: e + s * 3 * risk, realized: 0, left: 1, half: false };
      }
    }
    const open = pos ? { side: pos.side, iIn: pos.i, tIn: d.t[pos.i], pIn: pos.entry, stop: pos.stop, stop0: pos.stop0, t1: pos.t1, t2: pos.t2, half: pos.half, rNow: +(pos.side * (d.c[N] - pos.entry) / pos.risk).toFixed(2) } : null;
    return { trades, open, stats: stats(trades) };
  }

  function stats(tr) {
    const one = arr => {
      const n = arr.length; if (!n) return { n: 0 };
      const rs = arr.map(t => t.r), win = rs.filter(r => r > 0), loss = rs.filter(r => r <= 0);
      let eq = 0, peak = 0, dd = 0; for (const r of rs) { eq += r; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); }
      const gp = win.reduce((a, b) => a + b, 0), gl = -loss.reduce((a, b) => a + b, 0);
      return { n, win: +(win.length / n * 100).toFixed(1), avgR: +(rs.reduce((a, b) => a + b, 0) / n).toFixed(3), totalR: +eq.toFixed(2), pf: gl > 0 ? +(gp / gl).toFixed(2) : null, maxDDR: +dd.toFixed(2) };
    };
    return { all: one(tr), long: one(tr.filter(t => t.side > 0)), short: one(tr.filter(t => t.side < 0)) };
  }

  // Поточний стан для людини: сетап на останній закритій свічці / відкрита позиція / очікування з умовами
  function current(d, R, htfComp, res, N) {
    const f = x => (x == null || !isFinite(x) ? "–" : (+x).toLocaleString("uk-UA", { maximumFractionDigits: Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 1 ? 2 : 6 }));
    if (res.open) {
      const o = res.open, side = o.side > 0 ? "ЛОНГ" : "ШОРТ";
      const fresh = o.iIn === N;
      return {
        kind: fresh ? "setup" : "open", side: o.side,
        title: fresh ? `НОВИЙ СЕТАП: ${side}` : `ВІДКРИТА ПОЗИЦІЯ ЗА ПРАВИЛАМИ: ${side}`,
        lines: [
          `Вхід: ${f(o.pIn)} (закриття сигнальної свічки)`,
          `Стоп: ${f(o.stop)}${o.half ? " (перенесено в беззбиток)" : ` (−1R = 2 ATR)`}`,
          `Ціль 1: ${f(o.t1)} (+1R, закрити половину)${o.half ? " — досягнута" : ""}`,
          `Ціль 2: ${f(o.t2)} (+3R)`,
          `Вихід раніше: Supertrend проти позиції або оцінка перетне 0. Зараз ${o.rNow > 0 ? "+" : ""}${o.rNow}R.`,
        ],
      };
    }
    const c = R.comp[N], h = htfComp ? htfComp[N] : null;
    return {
      kind: "wait", side: 0, title: "СЕТАПУ НЕМАЄ — ОЧІКУВАННЯ",
      lines: [
        `Лонг: потрібна оцінка ≥ +3 (зараз ${c > 0 ? "+" : ""}${c})${htfComp ? `, старший ТФ ≥ 0 (зараз ${h > 0 ? "+" : ""}${isFinite(h) ? h : "–"})` : ""}.`,
        `Шорт: потрібна оцінка ≤ −3 при перетині (зараз ${c > 0 ? "+" : ""}${c})${htfComp ? `, старший ТФ ≤ 0` : ""}.`,
      ],
    };
  }

  const API = { alignHTF, run, current, stats };
  if (typeof module !== "undefined") module.exports = API; else root.STRAT = API;
})(typeof window !== "undefined" ? window : globalThis);
