import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = 'C:\\Users\\Shlok Naidu\\Desktop\\ShopRight Screenshots';

async function loginApi(email, password) {
  const res = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}`);
  const json = await res.json();
  return json.data;
}

async function main() {
  console.log('1. Logging in customer...');
  const customerAuth = await loginApi('customer@shopright.local', 'Password123!');

  console.log('2. Creating demo order with UPI_QR payment...');
  const orderRes = await fetch('http://localhost:3001/api/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerAuth.accessToken}`,
    },
    body: JSON.stringify({
      shopId: 'demo-shop-fresh-daily',
      deliveryAddressId: 'demo-customer-home-addr',
      items: [
        { productId: 'demo-prod-apples', quantity: 2 },
        { productId: 'demo-prod-milk', quantity: 2 }
      ],
      idempotencyKey: `upi_track_${Date.now()}`
    }),
  });
  const orderJson = await orderRes.json();
  const order = orderJson.data;
  console.log('Order created:', order.id);

  console.log('3. Initiating UPI payment to get checkout URL & session...');
  const payRes = await fetch(`http://localhost:3001/api/v1/orders/${order.id}/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerAuth.accessToken}`,
    },
    body: JSON.stringify({ method: 'UPI_QR' }),
  });
  const payJson = await payRes.json();
  console.log('Payment initiated:', payJson.data);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,950'],
    defaultViewport: { width: 1440, height: 950, deviceScaleFactor: 1.5 },
  });

  const page = await browser.newPage();

  // ─────────────────────────────────────────────────────────────
  // Figure 5.4: customer app, order tracking page with live status & UPI QR
  // ─────────────────────────────────────────────────────────────
  console.log(`Navigating to /orders/${order.id}/track ...`);
  // Navigate to root first to set localStorage
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await page.evaluate((token, user) => {
    localStorage.setItem('shopright_customer_token', token);
  }, customerAuth.accessToken, customerAuth.user);

  await page.goto(`http://localhost:5173/orders/${order.id}/track`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));

  const trackShotPath = path.join(OUTPUT_DIR, 'Figure_5.4_customer_order_tracking_upi.png');
  await page.screenshot({ path: trackShotPath });
  console.log(`Saved Figure 5.4 to: ${trackShotPath} (${fs.statSync(trackShotPath).size} bytes)`);

  // ─────────────────────────────────────────────────────────────
  // Figure 5.10: Prisma Studio — User and Shop tables
  // ─────────────────────────────────────────────────────────────
  console.log('Navigating to Prisma Studio for Figure 5.10...');
  await page.goto('http://localhost:5555/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Click User model
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    const userDiv = divs.find(d => d.textContent?.trim() === 'User');
    if (userDiv) userDiv.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // Also click Shop model tab or open it side-by-side if possible, or click Shop model tab
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    const shopDiv = divs.find(d => d.textContent?.trim() === 'Shop');
    if (shopDiv) shopDiv.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  const fig510Path = path.join(OUTPUT_DIR, 'Figure_5.10_db_user_shop_tables.png');
  await page.screenshot({ path: fig510Path });
  console.log(`Saved Figure 5.10 to: ${fig510Path} (${fs.statSync(fig510Path).size} bytes)`);

  // ─────────────────────────────────────────────────────────────
  // Figure 5.11: Prisma Studio — Order, OrderItem and Payment tables (paise amounts)
  // ─────────────────────────────────────────────────────────────
  console.log('Navigating to Prisma Studio for Figure 5.11...');
  await page.goto('http://localhost:5555/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Click Order model
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    const orderDiv = divs.find(d => d.textContent?.trim() === 'Order');
    if (orderDiv) orderDiv.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // Click Payment model as well
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    const paymentDiv = divs.find(d => d.textContent?.trim() === 'Payment');
    if (paymentDiv) paymentDiv.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  const fig511Path = path.join(OUTPUT_DIR, 'Figure_5.11_db_order_payment_tables.png');
  await page.screenshot({ path: fig511Path });
  console.log(`Saved Figure 5.11 to: ${fig511Path} (${fs.statSync(fig511Path).size} bytes)`);

  await browser.close();
  console.log('Done recapturing Figures 5.4, 5.10, 5.11!');
}

main().catch(console.error);
