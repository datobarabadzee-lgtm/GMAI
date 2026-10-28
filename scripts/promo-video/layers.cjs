// Promo video pipeline — see README.md. Output goes to ./promo-out (git-ignored).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.env.OUT || path.resolve(__dirname, '../../promo-out/build');
fs.mkdirSync(OUT, { recursive: true });
const logo = 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, '../../public/brand/leadermed-logo-dark.png')).toString('base64');
const css = `*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;font-family:'Noto Sans Georgian',sans-serif;background:#102638;color:#fff;position:relative;overflow:hidden}
.g1{position:absolute;right:-260px;top:-240px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(8,198,255,.40),rgba(8,198,255,0) 68%)}
.g2{position:absolute;left:-260px;bottom:-200px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(24,84,168,.6),rgba(24,84,168,0) 70%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:54px 54px}
.bar{position:absolute;left:0;right:0;bottom:0;height:12px;background:linear-gradient(90deg,#F0B418,#08C6FF,#1854A8,#D85418)}`;
const head = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;600;700;800&display=block" rel="stylesheet"><style>${css}`;
const scenes = [
  ['s1', 'ექიმებისთვის · კლინიკური AI', 'პასუხი ცოდნის ბაზიდან — წყაროებით'],
  ['s2', 'პაციენტებისთვის · პრევენცია', 'პირადი პრევენციის გეგმა 2 წუთში'],
  ['s3', '7 რისკის სიმულატორი', 'ნახეთ, როგორ იკლებს თქვენი რისკი'],
  ['s4', 'ორსულობა · IVF', 'მშობიარობის თარიღი და კალენდარი'],
  ['s5', 'ნაყოფიერება', 'ოვულაცია და ორსულობის შანსი'],
];
const bg = ([id, k, t], i) => `${head}
.top{position:absolute;left:70px;right:70px;top:56px;display:flex;justify-content:space-between;align-items:center}.top img{height:62px}
.n{font-size:24px;font-weight:700;color:#7FE3FF;padding:8px 18px;border:1px solid rgba(8,198,255,.5);border-radius:999px;background:rgba(8,198,255,.14)}
.k{position:absolute;left:70px;top:150px;font-size:30px;font-weight:700;color:#08C6FF}
h1{position:absolute;left:70px;right:60px;top:196px;font-size:52px;line-height:1.15;font-weight:800}
.sh{position:absolute;left:176px;top:316px;width:728px;height:1545px;border-radius:72px;box-shadow:0 50px 120px rgba(0,0,0,.6)}
</style></head><body><div class="g1"></div><div class="g2"></div><div class="grid"></div>
<div class="top"><img src="${logo}"><span class="n">${i + 1} / ${scenes.length}</span></div><p class="k">${k}</p><h1>${t}</h1><div class="sh"></div><div class="bar"></div></body></html>`;
const card = (inner) => `${head}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 80px}
.c img{height:150px;margin-bottom:70px}.k{font-size:36px;font-weight:700;color:#08C6FF}
h1{margin-top:24px;font-size:84px;line-height:1.12;font-weight:800}.s{margin-top:34px;font-size:38px;color:rgba(255,255,255,.8);line-height:1.4}
.chips{margin-top:60px;display:flex;flex-wrap:wrap;gap:16px;justify-content:center}.chip{font-size:30px;padding:14px 26px;border-radius:18px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.18)}
.url{margin-top:56px;font-size:30px;font-weight:700;color:#fff;background:rgba(8,198,255,.18);border:2px solid rgba(8,198,255,.6);padding:20px 30px;border-radius:22px;word-break:break-all}
</style></head><body><div class="g1"></div><div class="g2"></div><div class="grid"></div><div class="c">${inner}</div><div class="bar"></div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const shoot = async (html, f) => { await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.screenshot({ path: `${OUT}/${f}` }); };
  for (let i = 0; i < scenes.length; i++) await shoot(bg(scenes[i], i), `bg-${scenes[i][0]}.png`);
  await shoot(card(`<img src="${logo}"><p class="k">უფასოდ · ქართულად · წყაროებით</p><h1>ქართული სამედიცინო AI</h1><p class="s">ექიმებისთვის, პაციენტებისთვის<br>და სტუდენტებისთვის</p>`), 'intro.png');
  await shoot(card(`<img src="${logo}"><h1>სცადეთ ახლავე</h1><div class="chips"><span class="chip">✓ უფასოდ</span><span class="chip">✓ რეგისტრაციის გარეშე</span><span class="chip">✓ ქართულად</span></div><p class="url">gmai-29267867738.europe-west1.run.app</p><p class="s">ლიდერმედი · სამედიცინო ცოდნა ყველასთვის</p>`), 'outro.png');
  await b.close(); console.log('ok');
})();
