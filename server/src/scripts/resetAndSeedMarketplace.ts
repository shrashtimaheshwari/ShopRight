import dotenv from 'dotenv';
import { Role, ShopStatus, OrderStatus, PaymentMethod, PaymentStatus } from '@shopright/shared-types';
import { prisma } from '../prisma.js';
import { hashPassword } from '../modules/auth/tokenService.js';

dotenv.config();

export async function resetAndSeedMarketplace() {
  console.log('🧹 [1/5] Cleaning up all previous orders, payments, ratings, products, and shops...');

  // 1. Delete order-dependent child records first
  await prisma.orderItem.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.rating.deleteMany({});
  await prisma.order.deleteMany({});
  console.log('   ✓ Cleaned all previous orders, items, payments, and ratings.');

  // 2. Delete products and shops
  await prisma.product.deleteMany({});
  await prisma.shop.deleteMany({});
  console.log('   ✓ Cleaned all existing products and shops.');

  // 3. Ensure Delivery Fee Rule
  const existingRule = await prisma.deliveryFeeRule.findFirst();
  if (!existingRule) {
    await prisma.deliveryFeeRule.create({
      data: {
        baseFee: 2500,                // ₹25.00
        perKmFee: 800,                // ₹8.00 per km
        freeDeliveryThreshold: 49900, // Free delivery above ₹499.00
      },
    });
    console.log('   ✓ Seeded default delivery fee rule.');
  }

  // 4. Ensure Users
  console.log('👥 [2/5] Ensuring merchant, customer, and delivery partner users...');
  const passwordHash = await hashPassword('Password123!');

  const merchant = await prisma.user.upsert({
    where: { email: 'merchant@shopright.local' },
    update: { name: 'Ramesh Merchant', phone: '+919876543201' },
    create: {
      name: 'Ramesh Merchant',
      email: 'merchant@shopright.local',
      phone: '+919876543201',
      passwordHash,
      role: Role.SHOPKEEPER,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@shopright.local' },
    update: { name: 'Shlok Naidu', phone: '+919876543202' },
    create: {
      name: 'Shlok Naidu',
      email: 'customer@shopright.local',
      phone: '+919876543202',
      passwordHash,
      role: Role.CUSTOMER,
    },
  });

  const deliveryPartner = await prisma.user.upsert({
    where: { email: 'partner@shopright.local' },
    update: { name: 'Vikram Delivery Partner', phone: '+919876543203' },
    create: {
      name: 'Vikram Delivery Partner',
      email: 'partner@shopright.local',
      phone: '+919876543203',
      passwordHash,
      role: Role.DELIVERY_PARTNER,
      deliveryProfile: {
        create: {
          isAvailable: true,
          currentLat: 12.9780,
          currentLng: 77.6400,
          vehicleType: 'MOTORCYCLE',
        },
      },
    },
  });

  // Ensure Customer Addresses in Indiranagar Bengaluru
  const customerAddress = await prisma.address.upsert({
    where: { id: 'demo-customer-home-addr' },
    update: {
      userId: customer.id,
      label: 'Home',
      line1: '12th Main, HAL 2nd Stage, Indiranagar',
      city: 'Bengaluru',
      lat: 12.9784,
      lng: 77.6408,
      isDefault: true,
    },
    create: {
      id: 'demo-customer-home-addr',
      userId: customer.id,
      label: 'Home',
      line1: '12th Main, HAL 2nd Stage, Indiranagar',
      city: 'Bengaluru',
      lat: 12.9784,
      lng: 77.6408,
      isDefault: true,
    },
  });

  // 5. Seed 4 New Shops with minimum 10 items each
  console.log('🏪 [3/5] Creating 4 new approved shops with 11 items each (44 items total)...');

  // -------------------------------------------------------------
  // SHOP 1: Nature's Basket & Fresh Produce (Category: Produce)
  // -------------------------------------------------------------
  const shopProduce = await prisma.shop.create({
    data: {
      id: 'shop-natures-produce',
      ownerId: merchant.id,
      name: "Nature's Basket & Fresh Produce",
      description: 'Hand-picked organic orchard fruits, crisp farm vegetables, and daily greens.',
      category: 'Produce',
      lat: 12.9780,
      lng: 77.6410,
      address: '100ft Road, HAL 2nd Stage, Indiranagar, Bengaluru',
      status: ShopStatus.APPROVED,
      serviceRadiusKm: 10.0,
      products: {
        create: [
          {
            name: 'Shimla Royal Crisp Apples (1 kg)',
            description: 'Crisp, hand-picked sweet red apples from Himachal orchards.',
            price: 16000, // ₹160.00
            unit: 'kg',
            imageUrl: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Robusta Mountain Bananas (1 Dozen)',
            description: 'Naturally ripened, sweet and energy-dense bananas.',
            price: 5500, // ₹55.00
            unit: 'dozen',
            imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Farm Fresh Alphonso Mangoes (1 kg)',
            description: 'Aromatic, rich golden pulp Ratnagiri Alphonso mangoes.',
            price: 38000, // ₹380.00
            unit: 'kg',
            imageUrl: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Hydroponic Baby Spinach (250g)',
            description: 'Tender baby spinach leaves, pesticide-free and pre-washed.',
            price: 4500, // ₹45.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Organic Vine-Ripened Tomatoes (1 kg)',
            description: 'Plump, juicy red tomatoes packed with flavour.',
            price: 4000, // ₹40.00
            unit: 'kg',
            imageUrl: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Crisp English Cucumbers (500g)',
            description: 'Fresh and hydrating salad cucumbers directly from local polyhouses.',
            price: 3500, // ₹35.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1449339854873-750e6913301b?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Fresh Hass Avocados (Pack of 2)',
            description: 'Creamy, perfectly ripe avocados ideal for guacamole and toast.',
            price: 19000, // ₹190.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Sweet American Corn (Pack of 2)',
            description: 'Tender, sweet golden corn cobs fresh from harvest.',
            price: 5000, // ₹50.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Button White Mushrooms (200g Pack)',
            description: 'Fresh, firm white button mushrooms for curries, pizzas, and stir-fries.',
            price: 6000, // ₹60.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1504544750208-dc0358e63f7f?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Fresh Mint & Coriander Bunch',
            description: 'Aromatic garden-fresh mint and coriander leaves.',
            price: 2500, // ₹25.00
            unit: 'bunch',
            imageUrl: 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=500&q=80',
            inStock: true,
          },
          {
            name: '₹2 Quick Verification Test Orange',
            description: 'Low-cost live payment gateway verification item (₹2.00)',
            price: 200, // ₹2.00
            unit: 'piece',
            imageUrl: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=500&q=80',
            inStock: true,
          },
        ],
      },
    },
  });

  // -------------------------------------------------------------
  // SHOP 2: GreenLeaf Supermarket & Groceries (Category: Grocery)
  // -------------------------------------------------------------
  const shopGrocery = await prisma.shop.create({
    data: {
      id: 'shop-greenleaf-groceries',
      ownerId: merchant.id,
      name: 'GreenLeaf Supermarket & Groceries',
      description: 'Your trusted neighborhood supermarket for dairy, grains, pantry staples, and snacks.',
      category: 'Grocery',
      lat: 12.9795,
      lng: 77.6380,
      address: '45 CMH Road, Indiranagar, Bengaluru',
      status: ShopStatus.APPROVED,
      serviceRadiusKm: 10.0,
      products: {
        create: [
          {
            name: 'Farm Fresh Whole Milk (1L)',
            description: 'Pasteurized, homogenized whole cow milk, delivered chilled daily.',
            price: 6800, // ₹68.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Royal Basmati Rice (5 kg)',
            description: 'Aged long-grain aromatic basmati rice for fragrant biryanis and pulao.',
            price: 42000, // ₹420.00
            unit: 'bag',
            imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Aashirvaad Shudh Chakki Atta (5 kg)',
            description: '100% whole wheat flour ground from golden grains.',
            price: 26500, // ₹265.00
            unit: 'bag',
            imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Fortune Sunlite Refined Sunflower Oil (1L)',
            description: 'Light and healthy cooking oil enriched with vitamins A & D.',
            price: 14500, // ₹145.00
            unit: 'pouch',
            imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Amul Salted Butter (500g)',
            description: 'Utterly butterly delicious creamy table butter.',
            price: 27500, // ₹275.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Tata Salt Vacuum Evaporated (1 kg)',
            description: 'Desh ka namak, iodized table salt with guaranteed purity.',
            price: 2800, // ₹28.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Organic Raw Forest Honey (500g)',
            description: 'Unprocessed pure wild forest honey packed with natural antioxidants.',
            price: 34000, // ₹340.00
            unit: 'jar',
            imageUrl: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Tata Tea Gold Rich Taste (500g)',
            description: 'Exquisite blend of fine Assam CTC tea with gently rolled long leaves.',
            price: 32000, // ₹320.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=500&q=80',
            inStock: true,
          },
          {
            name: "Kellogg's Corn Flakes Original (475g)",
            description: 'Crispy sun-ripened corn flakes loaded with essential iron and vitamins.',
            price: 19500, // ₹195.00
            unit: 'box',
            imageUrl: 'https://images.unsplash.com/photo-1521483451569-e33803c0330c?w=500&q=80',
            inStock: true,
          },
          {
            name: "Haldiram's Bhujia Sev (400g)",
            description: 'Crispy spicy gram flour noodles with a touch of moth dal.',
            price: 11000, // ₹110.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Britannia Good Day Butter Cookies (600g)',
            description: 'Rich butter cookies with delightful smiles on every bite.',
            price: 9000, // ₹90.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=500&q=80',
            inStock: true,
          },
        ],
      },
    },
  });

  // -------------------------------------------------------------
  // SHOP 3: The Artisan Bakehouse & Patisserie (Category: Bakery)
  // -------------------------------------------------------------
  const shopBakery = await prisma.shop.create({
    data: {
      id: 'shop-artisan-bakehouse',
      ownerId: merchant.id,
      name: 'The Artisan Bakehouse & Patisserie',
      description: 'Slow-fermented artisan sourdough, buttery French viennoiserie, and handcrafted desserts.',
      category: 'Bakery',
      lat: 12.9775,
      lng: 77.6430,
      address: '12th Main Road, Indiranagar, Bengaluru',
      status: ShopStatus.APPROVED,
      serviceRadiusKm: 10.0,
      products: {
        create: [
          {
            name: 'Classic French Butter Croissant (Pack of 2)',
            description: 'Flaky, 100% French butter lamination with golden crisp crust and airy honeycomb crumb.',
            price: 18000, // ₹180.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&q=80',
            inStock: true,
          },
          {
            name: 'San Francisco Sourdough Boule (500g)',
            description: '36-hour slow cold fermentation loaf with a blistered crust and tangy moist crumb.',
            price: 16000, // ₹160.00
            unit: 'loaf',
            imageUrl: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Artisanal Multigrain Seed Bread (400g)',
            description: 'Loaded with toasted pumpkin, flax, sunflower, and sesame seeds.',
            price: 9500, // ₹95.00
            unit: 'loaf',
            imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Belgian Dark Chocolate Fudge Brownie (Pack of 2)',
            description: 'Dense, fudgy brownies baked with 70% Callebaut Belgian dark chocolate.',
            price: 19000, // ₹190.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Blueberry Cream Cheese Muffin',
            description: 'Moist golden muffin packed with wild blueberries and a cream cheese swirl.',
            price: 11000, // ₹110.00
            unit: 'piece',
            imageUrl: 'https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=500&q=80',
            inStock: true,
          },
          {
            name: 'New York Baked Cheesecake Slice',
            description: 'Creamy, rich baked cheesecake on a buttery Graham cracker biscuit crust.',
            price: 22000, // ₹220.00
            unit: 'slice',
            imageUrl: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Cinnamon Swirl Brioche Roll',
            description: 'Tender brioche spiral glazed with Madagascar vanilla icing and Ceylon cinnamon.',
            price: 8500, // ₹85.00
            unit: 'piece',
            imageUrl: 'https://images.unsplash.com/photo-1509365465985-25d11c17e812?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Rosemary & Sea Salt Olive Oil Focaccia',
            description: 'Fluffy Genovese focaccia dimpled with extra virgin olive oil, fresh rosemary, and Maldon salt.',
            price: 14000, // ₹140.00
            unit: 'piece',
            imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Chocochip Walnut Cookies (Box of 6)',
            description: 'Soft-baked cookies loaded with semi-sweet chocolate chips and toasted Californian walnuts.',
            price: 24000, // ₹240.00
            unit: 'box',
            imageUrl: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Garlic Herb Butter Baguette',
            description: 'Crispy French baguette sliced and generously layered with roasted garlic parsley butter.',
            price: 12000, // ₹120.00
            unit: 'loaf',
            imageUrl: 'https://images.unsplash.com/photo-1598373182133-52452f7691ef?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Cold Brew Arabica Coffee (500ml)',
            description: '18-hour cold steeped single-estate Chikmagalur Arabica coffee.',
            price: 28000, // ₹280.00
            unit: 'bottle',
            imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&q=80',
            inStock: true,
          },
        ],
      },
    },
  });

  // -------------------------------------------------------------
  // SHOP 4: Apex Healthcare & Wellness Pharmacy (Category: Pharmacy)
  // -------------------------------------------------------------
  const shopPharmacy = await prisma.shop.create({
    data: {
      id: 'shop-apex-pharmacy',
      ownerId: merchant.id,
      name: 'Apex Healthcare & Wellness Pharmacy',
      description: 'Trusted prescription medicines, vitamins, supplements, first aid, and everyday personal care.',
      category: 'Pharmacy',
      lat: 12.9760,
      lng: 77.6390,
      address: '80ft Road, Indiranagar, Bengaluru',
      status: ShopStatus.APPROVED,
      serviceRadiusKm: 10.0,
      products: {
        create: [
          {
            name: 'Vitamin C 1000mg + Zinc Effervescent (20 Tabs)',
            description: 'Fizzy tangy orange immunity booster drink tablets with zinc for daily vitality.',
            price: 29000, // ₹290.00
            unit: 'tube',
            imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Daily Multivitamin & Minerals (60 Softgels)',
            description: 'Complete nutritional support with 24 essential vitamins, minerals, and Korean ginseng.',
            price: 49900, // ₹499.00
            unit: 'bottle',
            imageUrl: 'https://images.unsplash.com/photo-1577401239170-897942555fb3?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Dettol Antiseptic Disinfectant Liquid (550ml)',
            description: 'Proven germ-protection formula for first aid, wound cleaning, and personal hygiene.',
            price: 17500, // ₹175.00
            unit: 'bottle',
            imageUrl: 'https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Savlon Herbal Hand Sanitizer (500ml)',
            description: '70% alcohol-based gel with neem and tulsi extracts for 99.9% germ kill.',
            price: 12000, // ₹120.00
            unit: 'bottle',
            imageUrl: 'https://images.unsplash.com/photo-1584634731339-252c581abfc5?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Fast Relief Herbal Pain Balm (45g)',
            description: 'Instant soothing relief for headaches, neck tension, and back pain with eucalyptus oil.',
            price: 8500, // ₹85.00
            unit: 'jar',
            imageUrl: 'https://images.unsplash.com/photo-1608248597359-5f284e56ba85?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Fast-Read Digital Clinical Thermometer',
            description: 'Accurate 10-second digital fever thermometer with beep alarm and LCD display.',
            price: 22000, // ₹220.00
            unit: 'piece',
            imageUrl: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Hansaplast Waterproof Bandages (Pack of 20)',
            description: 'Breathable, flexible wound protection strips with non-stick wound pad.',
            price: 6500, // ₹65.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Electrolyte ORS Hydration Drink (Pack of 4)',
            description: 'WHO-recommended oral rehydration salts solution with refreshing apple flavour.',
            price: 9000, // ₹90.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Certified N95 Protective Face Masks (Pack of 5)',
            description: '5-layer filtration mask with electrostatically charged meltblown filter.',
            price: 15000, // ₹150.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1586942593568-29361efcd571?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Organic Cold-Pressed Aloe Vera Gel (200ml)',
            description: '99% pure soothing aloe vera gel for intense skin hydration and cooling sunburn care.',
            price: 19500, // ₹195.00
            unit: 'tube',
            imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&q=80',
            inStock: true,
          },
          {
            name: 'Himalaya Pure Hands Moisturizing Soap (Pack of 3)',
            description: 'Enriched with tea tree oil and tulsi to protect against daily germs while keeping skin soft.',
            price: 11500, // ₹115.00
            unit: 'pack',
            imageUrl: 'https://images.unsplash.com/photo-1607006314605-726487e49eb7?w=500&q=80',
            inStock: true,
          },
        ],
      },
    },
  });

  // 6. Create 1 Completed Order History record
  console.log('📦 [4/5] Creating 1 realistic completed order with 5-star rating for customer history...');
  const firstProduceProd = await prisma.product.findFirst({
    where: { shopId: shopProduce.id, name: { contains: 'Apples' } },
  });
  const secondProduceProd = await prisma.product.findFirst({
    where: { shopId: shopProduce.id, name: { contains: 'Bananas' } },
  });

  if (firstProduceProd && secondProduceProd) {
    const subtotal = firstProduceProd.price + secondProduceProd.price; // ₹160 + ₹55 = ₹215
    const deliveryFee = 2500; // ₹25.00
    const total = subtotal + deliveryFee;

    const completedOrder = await prisma.order.create({
      data: {
        customerId: customer.id,
        shopId: shopProduce.id,
        deliveryPartnerId: deliveryPartner.id,
        deliveryAddressId: customerAddress.id,
        status: OrderStatus.DELIVERED,
        subtotal,
        deliveryFee,
        total,
        idempotencyKey: `completed_demo_order_${Date.now()}`,
        items: {
          create: [
            {
              productId: firstProduceProd.id,
              quantity: 1,
              unitPriceAtOrder: firstProduceProd.price,
            },
            {
              productId: secondProduceProd.id,
              quantity: 1,
              unitPriceAtOrder: secondProduceProd.price,
            },
          ],
        },
        payment: {
          create: {
            method: PaymentMethod.UPI_QR,
            status: PaymentStatus.COMPLETED,
            providerRef: 'pay_hist_demo_001',
            checkoutUrl: 'https://youpi-pg-production-4bc5adb9.up.railway.app',
          },
        },
        rating: {
          create: {
            customerId: customer.id,
            shopId: shopProduce.id,
            stars: 5,
            comment: 'Super fast delivery! Apples and bananas were perfectly fresh and crisp.',
          },
        },
      },
    });
    console.log(`   ✓ Completed order #${completedOrder.id.slice(0, 8)} created in order history.`);
  }

  // 7. Summary
  const shopCount = await prisma.shop.count();
  const productCount = await prisma.product.count();
  const orderCount = await prisma.order.count();

  console.log('\n======================================================');
  console.log('🎉 MARKETPLACE RESET & SEED COMPLETE!');
  console.log(`• Total Active Approved Shops: ${shopCount}`);
  console.log(`• Total Catalog Products:     ${productCount} (11 items per shop)`);
  console.log(`• Total Orders:               ${orderCount} (1 delivered in history)`);
  console.log('• Customer Account:           customer@shopright.local / Password123!');
  console.log('• Customer Location:          Indiranagar, Bengaluru (12.9784, 77.6408)');
  console.log('• Live Gateway Target:        https://youpi-pg-production-4bc5adb9.up.railway.app');
  console.log('======================================================\n');
}

// Execute directly if run as CLI
resetAndSeedMarketplace()
  .catch((e) => {
    console.error('❌ Error during reset and seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
