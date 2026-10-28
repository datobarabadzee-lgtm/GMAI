// Promo video pipeline — see README.md. Output goes to ./promo-out (git-ignored).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || require('path').resolve(__dirname, '../../promo-out/frames');
const B = process.env.BASE || 'https://gmai-29267867738.europe-west1.run.app';
const VP = { width: 430, height: 932 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = {};
async function scene(name, fn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const dir = `${OUT}/${name}`; fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const i = frames.length; fs.writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(f.data, 'base64'));
    frames.push(f.metadata.timestamp);
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 860, maxHeight: 1864, everyNthFrame: 1 });
  const mark = (k) => { (marks[name] ||= {})[k] = Date.now() / 1000; };
  try { await fn(page, mark); } catch (e) { console.error(name, e.message); }
  mark('end');
  await sleep(300);
  await cdp.send('Page.stopScreencast');
  await ctx.close(); await browser.close();
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? frames[i + 1] - frames[i] : 0.5;
    lines.push(`file '${dir}/${String(i).padStart(5, '0')}.jpg'`, `duration ${Math.max(0.001, d).toFixed(4)}`);
  }
  lines.push(`file '${dir}/${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  fs.writeFileSync(`${OUT}/${name}.txt`, lines.join('\n'));
  const rel = Object.fromEntries(Object.entries(marks[name]).map(([k, v]) => [k, +(v - frames[0]).toFixed(2)]));
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(rel));
  console.log(name, frames.length, 'frames', JSON.stringify(rel));
}

async function smoothScroll(page, to, ms = 2500) {
  await page.evaluate(async ({ to, ms }) => {
    const from = window.scrollY, t0 = performance.now();
    await new Promise((res) => { const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; window.scrollTo(0, from + (to - from) * e); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  }, { to, ms });
}
const yOf = (page, text) => page.evaluate((s) => { const el = [...document.querySelectorAll('h1,h2,h3,p,span,button,li')].find((e) => e.textContent.trim().startsWith(s)); return el ? el.getBoundingClientRect().top + window.scrollY - 110 : 0; }, text);
async function slide(page, loc, from, to, steps = 18, ms = 70) {
  for (let i = 0; i <= steps; i++) { await loc.fill(String(Math.round(from + ((to - from) * i) / steps))); await sleep(ms); }
}

(async () => {
  await scene('s1-clinical', async (p, mark) => {
    await p.goto(`${B}/clinical`, { waitUntil: 'networkidle' }); mark('loaded'); await sleep(1200);
    const ta = p.getByRole('textbox', { name: 'კითხვა' });
    await ta.click(); await ta.pressSequentially('რა არის სეფსისის საწყისი მართვა პირველ საათში?', { delay: 45 });
    await sleep(500); mark('send');
    await p.getByRole('button', { name: 'გაგზავნა' }).click();
    await p.getByText('მოკლე პასუხი').first().waitFor({ timeout: 120000 });
    mark('answer'); await sleep(1500);
    const h = await p.evaluate(() => document.body.scrollHeight);
    await smoothScroll(p, Math.min(h - 932, 1300), 5000); await sleep(800);
    await smoothScroll(p, Math.min(h - 932, 2600), 4000); await sleep(1000);
  });
  await scene('s2-prevention', async (p, mark) => {
    await p.goto(`${B}/prevention`, { waitUntil: 'networkidle' }); mark('loaded'); await sleep(1500);
    await p.getByRole('button', { name: /კალენდარი და შეხსენებები/ }).first().click(); await sleep(700);
    const sb = p.getByRole('spinbutton'); await sb.click(); await sb.pressSequentially('52', { delay: 150 }); await sleep(400);
    await p.getByRole('button', { name: 'ქალი' }).click(); await sleep(600);
    await p.getByRole('button', { name: /კალენდრის გახსნა/ }).click(); mark('plan'); await sleep(1800);
    await smoothScroll(p, 700, 3500); await sleep(900); await smoothScroll(p, 1500, 3500); await sleep(1000);
  });
  await scene('s3-simulator', async (p, mark) => {
    await p.goto(`${B}/prevention?tool=simulator`, { waitUntil: 'networkidle' }); mark('loaded'); await sleep(800);
    await smoothScroll(p, await yOf(p, 'ასაკი') - 20, 1200);
    await slide(p, p.getByRole('slider', { name: 'ასაკი' }).first(), 55, 58, 3, 120);
    await smoothScroll(p, await yOf(p, 'ინფარქტი და ინსულტი') + 300, 1500); await sleep(500);
    const sw = p.getByRole('switch', { name: 'ვეწევი' }); if (!(await sw.getAttribute('aria-checked') === 'true')) await sw.click();
    const sbp = p.getByRole('slider', { name: /ზედა/ }); await slide(p, sbp, 130, 165, 14, 60); await sleep(1200);
    mark('high');
    await smoothScroll(p, await yOf(p, 'ინფარქტი და ინსულტი') + 20, 1000);
    await sleep(600); await slide(p, sbp, 165, 120, 22, 90); await sleep(500); await sw.click(); await sleep(1800);
    await smoothScroll(p, await yOf(p, 'ინფარქტი და ინსულტი') + 520, 1500); await sleep(1500);
    await smoothScroll(p, await yOf(p, 'ინფარქტი და ინსულტი') - 330, 1200);
    await p.getByRole('tab', { name: /მოწევის შეწყვეტა/ }).click(); await sleep(800);
    await smoothScroll(p, await yOf(p, 'მოწევის შეწყვეტა —') - 10, 1200); await sleep(2200);
  });
  await scene('s4-pregnancy', async (p, mark) => {
    await p.goto(`${B}/reproductive`, { waitUntil: 'networkidle' }); mark('loaded'); await sleep(1500);
    await smoothScroll(p, await yOf(p, 'მშობიარობის სავარაუდო თარიღი') - 10, 1500); await sleep(500);
    await p.getByRole('button', { name: 'ემბრიონის გადატანა (IVF)' }).click(); await sleep(900);
    await smoothScroll(p, await yOf(p, 'სავარაუდო თარიღი') - 120, 1800); await sleep(1500);
    await p.getByRole('button', { name: /ჩემი ორსულობის კალენდარი/ }).click(); mark('cal'); await sleep(1300);
    await p.getByRole('button', { name: 'უარყოფითი' }).click(); await sleep(900);
    await smoothScroll(p, 1300, 4000); await sleep(600); await smoothScroll(p, 2600, 4000); await sleep(1000);
  });
  await scene('s5-fertility', async (p, mark) => {
    await p.goto(`${B}/reproductive?tool=ovulation`, { waitUntil: 'networkidle' }); mark('loaded'); await sleep(800);
    await smoothScroll(p, await yOf(p, 'ნაყოფიერი დღეები და ოვულაცია') - 10, 1200);
    const cyc = p.getByRole('slider', { name: 'ციკლის ხანგრძლივობა' }); await slide(p, cyc, 28, 32, 4, 250); await slide(p, cyc, 32, 28, 4, 250);
    await smoothScroll(p, await yOf(p, 'ოქტომბერი') - 40, 1800); await sleep(2200);
    await smoothScroll(p, 0, 800);
    await p.getByRole('tab', { name: /ორსულობის შანსი/ }).click(); await sleep(600);
    await smoothScroll(p, await yOf(p, 'რამდენ ხანში') - 10, 1200); await sleep(1500);
    await smoothScroll(p, await yOf(p, 'ქალის ასაკი') - 30, 1200);
    const age = p.getByRole('slider', { name: 'ქალის ასაკი' }); await slide(p, age, 32, 37, 5, 150);
    const mo = p.getByRole('slider', { name: 'რამდენი თვეა, რაც ცდილობთ' }); await slide(p, mo, 2, 8, 6, 220); await sleep(2500);
  });
})();
