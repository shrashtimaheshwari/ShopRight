import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = 'C:\\Users\\Shlok Naidu\\Desktop\\ShopRight Screenshots';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,950'],
    defaultViewport: { width: 1440, height: 950, deviceScaleFactor: 1.5 },
  });

  const page = await browser.newPage();

  console.log('Capturing Figure 5.10 from Prisma Studio (User / Shop)...');
  await page.goto('http://localhost:5555/User', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'Figure_5.10_db_user_shop_tables.png') });
  console.log('Saved Figure 5.10');

  console.log('Capturing Figure 5.11 from Prisma Studio (Order / Payment)...');
  await page.goto('http://localhost:5555/Order', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'Figure_5.11_db_order_payment_tables.png') });
  console.log('Saved Figure 5.11');

  await browser.close();
}

main().catch(console.error);
