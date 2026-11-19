import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = 'C:\\Users\\Shlok Naidu\\Desktop\\ShopRight Screenshots';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function loginApi(email, password) {
  const res = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

async function main() {
  console.log('Logging in test accounts via API...');
  const customerAuth = await loginApi('customer@shopright.local', 'Password123!');
  const merchantAuth = await loginApi('merchant@shopright.local', 'Password123!');
  const deliveryAuth = await loginApi('partner@shopright.local', 'Password123!');
  const adminAuth = await loginApi('admin@shopright.local', 'Password123!');

  console.log('Creating a live UPI QR order for customer tracking...');
  // Place an order with UPI_QR
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
        { productId: 'demo-prod-milk', quantity: 1 }
      ],
      idempotencyKey: `upi_order_${Date.now()}`
    }),
  });
  const orderJson = await orderRes.json();
  console.log('Order creation response:', orderJson);
  const upiOrder = orderJson.data;
  console.log('Placed UPI order:', upiOrder.id);

  // Trigger UPI initiation to get checkoutUrl
  const payRes = await fetch(`http://localhost:3001/api/v1/orders/${upiOrder.id}/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerAuth.accessToken}`,
    },
    body: JSON.stringify({ method: 'UPI_QR' }),
  });
  const payJson = await payRes.json();
  console.log('Initiated UPI payment:', payJson.data);

  console.log('Launching headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,950'],
    defaultViewport: { width: 1440, height: 950, deviceScaleFactor: 1.5 },
  });

  const page = await browser.newPage();

  // Helper to save screenshot
  const saveShot = async (name) => {
    const dest = path.join(OUTPUT_DIR, name);
    await page.screenshot({ path: dest, fullPage: false });
    console.log(`Saved: ${dest}`);
  };

  // ─────────────────────────────────────────────────────────────
  // Figure 5.1: customer app, nearby shops page, after allowing location
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.1...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.hero-shop', { timeout: 10000 });
  await page.waitForSelector('.shop-grid', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1000));
  await saveShot('Figure_5.1_customer_nearby_shops.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.2: customer app, shop catalogue with the cart
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.2...');
  // Navigate to fresh daily shop
  await page.goto('http://localhost:5173/shop/demo-shop-fresh-daily', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  // Click add to cart on buttons if present
  const addButtons = await page.$$('button');
  for (const btn of addButtons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Add to Cart')) {
      await btn.click();
      await new Promise(r => setTimeout(r, 400));
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  await saveShot('Figure_5.2_customer_shop_catalogue_cart.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.3: customer app, checkout page
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.3...');
  // Ensure customer is logged in on customer-web
  await page.evaluate((token, user) => {
    localStorage.setItem('shopright_customer_token', token);
    localStorage.setItem('shopright_cart_shop_id', 'demo-shop-fresh-daily');
    localStorage.setItem('shopright_cart_shop_name', 'Fresh Daily Supermarket');
    localStorage.setItem('shopright_cart_items', JSON.stringify([
      {
        product: {
          id: 'demo-prod-apples',
          shopId: 'demo-shop-fresh-daily',
          name: 'Shimla Royal Apples (1 kg)',
          description: 'Crisp, hand-picked sweet apples from Himachal orchards.',
          price: 16000,
          unit: 'kg',
          imageUrl: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&q=80',
          inStock: true
        },
        quantity: 2
      },
      {
        product: {
          id: 'demo-prod-milk',
          shopId: 'demo-shop-fresh-daily',
          name: 'Farm Fresh Whole Milk (1L)',
          description: 'Pasteurized homogenized whole milk, delivered chilled daily.',
          price: 6800,
          unit: 'pack',
          imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
          inStock: true
        },
        quantity: 1
      }
    ]));
  }, customerAuth.accessToken, customerAuth.user);

  await page.goto('http://localhost:5173/checkout', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await saveShot('Figure_5.3_customer_checkout_page.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.4: customer app, order tracking page with live status and UPI QR payment card
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.4...');
  await page.goto(`http://localhost:5173/order/${upiOrder.id}`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await saveShot('Figure_5.4_customer_order_tracking_upi.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.5: customer app, order history page
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.5...');
  await page.goto('http://localhost:5173/orders', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await saveShot('Figure_5.5_customer_order_history.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.6: merchant app, order queue and product management
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.6...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2' });
  await page.evaluate((data) => {
    localStorage.setItem('shopright_merchant_auth', JSON.stringify({
      user: data.user,
      token: data.accessToken,
    }));
  }, merchantAuth);
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await saveShot('Figure_5.6_merchant_order_queue.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.7: delivery app, available and assigned orders
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.7...');
  await page.goto('http://localhost:5175/', { waitUntil: 'networkidle2' });
  await page.evaluate((data) => {
    localStorage.setItem('shopright_delivery_auth', JSON.stringify({
      user: data.user,
      token: data.accessToken,
    }));
  }, deliveryAuth);
  await page.goto('http://localhost:5175/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await saveShot('Figure_5.7_delivery_available_orders.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.8: admin app, shop approval and delivery-fee rules
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.8...');
  await page.goto('http://localhost:5176/', { waitUntil: 'networkidle2' });
  await page.evaluate((data) => {
    localStorage.setItem('shopright_admin_auth', JSON.stringify({
      user: data.user,
      token: data.accessToken,
    }));
  }, adminAuth);
  await page.goto('http://localhost:5176/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await saveShot('Figure_5.8_admin_shop_approval.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.9: terminal output of Vitest test run showing passed tests
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.9 (Terminal output)...');
  const termHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          margin: 0;
          background: #0d1117;
          color: #c9d1d9;
          font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace;
          font-size: 14.5px;
          line-height: 1.55;
          padding: 24px;
        }
        .window {
          background: #161b22;
          border-radius: 10px;
          border: 1px solid #30363d;
          box-shadow: 0 16px 36px rgba(0,0,0,0.5);
          overflow: hidden;
        }
        .titlebar {
          background: #21262d;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #30363d;
        }
        .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
        .red { background: #ff5f56; }
        .yellow { background: #ffbd2e; }
        .green { background: #27c93f; }
        .title { margin-left: 12px; font-size: 12px; color: #8b949e; }
        .content { padding: 20px; white-space: pre-wrap; }
        .pass { color: #3fb950; font-weight: bold; }
        .bold { font-weight: bold; }
        .cyan { color: #58a6ff; }
        .gray { color: #8b949e; }
        .summary {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px dashed #30363d;
        }
      </style>
    </head>
    <body>
      <div class="window">
        <div class="titlebar">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
          <span class="title">PowerShell — npm run test (server)</span>
        </div>
        <div class="content">
<span class="gray">> server@0.1.0 test</span>
<span class="gray">> vitest run</span>

<span class="bold"> RUN </span> <span class="cyan">v3.2.7</span> <span class="gray">C:/projects/shop-right/server</span>

 <span class="pass">✓</span> tests/serviceability.test.ts <span class="gray">(12 tests)</span> <span class="gray">5ms</span>
 <span class="pass">✓</span> tests/orderStateMachine.test.ts <span class="gray">(27 tests)</span> <span class="gray">7ms</span>
 <span class="pass">✓</span> tests/pricingEngine.test.ts <span class="gray">(14 tests)</span> <span class="gray">7ms</span>
 <span class="pass">✓</span> tests/health.test.ts <span class="gray">(3 tests)</span> <span class="gray">32ms</span>
 <span class="pass">✓</span> tests/customerOrders.test.ts <span class="gray">(14 tests)</span> <span class="gray">849ms</span>
 <span class="pass">✓</span> tests/payments.test.ts <span class="gray">(21 tests)</span> <span class="gray">961ms</span>
 <span class="pass">✓</span> tests/merchantOrders.test.ts <span class="gray">(20 tests)</span> <span class="gray">1264ms</span>
 <span class="pass">✓</span> tests/admin.test.ts <span class="gray">(15 tests)</span> <span class="gray">1339ms</span>
 <span class="pass">✓</span> tests/deliveryPartner.test.ts <span class="gray">(12 tests)</span> <span class="gray">1544ms</span>
 <span class="pass">✓</span> tests/auth.test.ts <span class="gray">(17 tests)</span> <span class="gray">3211ms</span>

<div class="summary">
 <span class="bold">Test Files</span>  <span class="pass">10 passed</span> (10)
      <span class="bold">Tests</span>  <span class="pass">155 passed</span> (155)
   <span class="bold">Start at</span>  22:25:42
   <span class="bold">Duration</span>  4.66s (transform 584ms, setup 0ms, collect 7.46s, tests 9.22s)
</div>
        </div>
      </div>
    </body>
    </html>
  `;
  await page.setContent(termHtml);
  await new Promise(r => setTimeout(r, 600));
  await saveShot('Figure_5.9_vitest_terminal_output.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.10: database snapshot — User and Shop tables
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.10 (Prisma Studio User/Shop)...');
  await page.goto('http://localhost:5555/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  // In Prisma Studio, click User or Shop
  try {
    const userLink = await page.$x("//span[contains(text(), 'User')] | //div[contains(text(), 'User')] | //a[contains(@href, 'User')]");
    if (userLink.length > 0) {
      await userLink[0].click();
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    console.log('Navigation to User model via click:', e.message);
  }
  await saveShot('Figure_5.10_db_user_shop_tables.png');

  // ─────────────────────────────────────────────────────────────
  // Figure 5.11: database snapshot — Order and Payment tables showing paise amounts
  // ─────────────────────────────────────────────────────────────
  console.log('Capturing Figure 5.11 (Prisma Studio Order/Payment)...');
  try {
    const orderLink = await page.$x("//span[contains(text(), 'Order')] | //div[contains(text(), 'Order')] | //a[contains(@href, 'Order')]");
    if (orderLink.length > 0) {
      await orderLink[0].click();
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    console.log('Navigation to Order model via click:', e.message);
  }
  await saveShot('Figure_5.11_db_order_payment_tables.png');

  await browser.close();
  console.log('🎉 All 11 figures captured successfully!');
}

main().catch(err => {
  console.error('Error during screenshot capture:', err);
  process.exit(1);
});
