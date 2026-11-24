// Додає / прибирає монети в config.json. Використання: node src/manage.js "add=TAO,LINK" "remove=ZIL"
// Перевіряє формат тикера; чи існує пара — перевіряє compute.js (помилка пишеться в data/latest.json → errors).
const fs = require("fs");
const path = require("path");
const P = path.join(__dirname, "..", "config.json");
const cfg = JSON.parse(fs.readFileSync(P, "utf8"));
const parse = s => (s || "").toUpperCase().split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
let add = [], remove = [];
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split("=");
  if (k === "add") add = parse(v);
  if (k === "remove") remove = parse(v);
}
const bad = [...add, ...remove].filter(t => !/^[A-Z0-9]{2,12}$/.test(t));
if (bad.length) { console.error("Некоректні тикери: " + bad.join(", ")); process.exit(1); }
const before = cfg.assets.length;
for (const t of add) if (!cfg.assets.includes(t)) cfg.assets.push(t);
cfg.assets = cfg.assets.filter(t => !remove.includes(t));
fs.writeFileSync(P, JSON.stringify(cfg, null, 2) + "\n");
console.log(`монет: ${before} → ${cfg.assets.length}; додано: ${add.join(",") || "—"}; прибрано: ${remove.join(",") || "—"}`);
