// Tiny Playwright sanity test. Runs headless, screenshots whatever is at
// http://localhost:8084/, saves to /tmp/pw-test.png. Reports each step so we
// can see where it stalls.
import { chromium } from 'playwright';

console.log('1. launching');
const browser = await chromium.launch();

console.log('2. opening page');
const page = await browser.newPage();

try {
  await page.goto('http://localhost:8084/', { timeout: 15_000 });
  console.log('3. navigation ok');
} catch (e) {
  console.log('3. navigation failed:', e.message.split('\n')[0]);
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: '/tmp/pw-test.png', fullPage: true });
console.log('4. screenshot saved → /tmp/pw-test.png');

await browser.close();
console.log('5. done');
