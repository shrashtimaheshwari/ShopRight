import dotenv from 'dotenv';
import { Role, ShopStatus } from '@shopright/shared-types';
import { prisma } from '../prisma.js';
import { hashPassword } from '../modules/auth/tokenService.js';

dotenv.config();

async function main() {
  console.log('🌱 Seeding demo marketplace data...');

  // 1. Delivery Fee Rule
  const existingRule = await prisma.deliveryFeeRule.findFirst();
  if (!existingRule) {
    await prisma.deliveryFeeRule.create({
      data: {
        baseFee: 3000,               // ₹30.00
        perKmFee: 1000,              // ₹10.00 per km
        freeDeliveryThreshold: 50000, // Free delivery above ₹500.00
      },
    });
    console.log('✅ Active Delivery Fee Rule seeded.');
  }

  // 2. Demo Users (Merchant, Customer, Delivery Partner)
  const passwordHash = await hashPassword('Password123!');

  const merchant = await prisma.user.upsert({
    where: { email: 'merchant@shopright.local' },
    update: {},
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
    update: {},
    create: {
      name: 'Ananya Customer',
      email: 'customer@shopright.local',
      phone: '+919876543202',
      passwordHash,
      role: Role.CUSTOMER,
    },
  });

  await prisma.user.upsert({
    where: { email: 'partner@shopright.local' },
    update: {},
    create: {
      name: 'Vikram Delivery Partner',
      email: 'partner@shopright.local',
      phone: '+919876543203',
      passwordHash,
      role: Role.DELIVERY_PARTNER,
      deliveryProfile: {
        create: {
          isAvailable: true,
          currentLat: 12.9750,
          currentLng: 77.6100,
          vehicleType: 'MOTORCYCLE',
        },
      },
    },
  });

  // 3. Customer Address
  await prisma.address.upsert({
    where: { id: 'demo-customer-home-addr' },
    update: {},
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

  // 4. Approved Demo Shops & Catalog
  const shop1 = await prisma.shop.upsert({
    where: { id: 'demo-shop-fresh-daily' },
    update: {},
    create: {
      id: 'demo-shop-fresh-daily',
      ownerId: merchant.id,
      name: 'Fresh Daily Supermarket',
      description: 'Daily fresh groceries, dairy, produce, and packaged kitchen essentials.',
      category: 'Groceries',
      lat: 12.9752,
      lng: 77.6095,
      address: '45 MG Road, Bengaluru',
      status: ShopStatus.APPROVED,
      serviceRadiusKm: 5.0,
    },
  });

  await prisma.product.upsert({
    where: { id: 'demo-prod-apples' },
    update: {},
    create: {
      id: 'demo-prod-apples',
      shopId: shop1.id,
      name: 'Shimla Royal Apples (1 kg)',
      description: 'Crisp, hand-picked sweet apples from Himachal orchards.',
      price: 16000, // ₹160.00
      unit: 'kg',
      imageUrl: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&q=80',
      inStock: true,
    },
  });

  await prisma.product.upsert({
    where: { id: 'demo-prod-milk' },
    update: {},
    create: {
      id: 'demo-prod-milk',
      shopId: shop1.id,
      name: 'Farm Fresh Whole Milk (1L)',
      description: 'Pasteurized homogenized whole milk, delivered chilled daily.',
      price: 6800, // ₹68.00
      unit: 'pack',
      imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
      inStock: true,
    },
  });

  await prisma.product.upsert({
    where: { id: 'demo-prod-rice' },
    update: {},
    create: {
      id: 'demo-prod-rice',
      shopId: shop1.id,
      name: 'Royal Basmati Rice (5 kg)',
      description: 'Aged long-grain aromatic basmati rice.',
      price: 45000, // ₹450.00
      unit: 'bag',
      imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80',
      inStock: true,
    },
  });

  await prisma.product.upsert({
    where: { id: 'demo-prod-bread-oos' },
    update: {},
    create: {
      id: 'demo-prod-bread-oos',
      shopId: shop1.id,
      name: 'Artisanal Sourdough Loaf',
      description: 'Slow-fermented artisan sourdough bread.',
      price: 12000, // ₹120.00
      unit: 'loaf',
      imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80',
      inStock: false, // Out of stock for testing
    },
  });

  const shop2 = await prisma.shop.upsert({
    where: { id: 'demo-shop-apex-pharmacy' },
    update: {},
    create: {
      id: 'demo-shop-apex-pharmacy',
      ownerId: merchant.id,
      name: 'Apex Wellness Pharmacy',
      description: 'Prescription medicines, vitamins, wellness supplements, and first aid.',
      category: 'Healthcare',
      lat: 12.9800,
      lng: 77.6350,
      address: '100ft Road, Indiranagar, Bengaluru',
      status: ShopStatus.APPROVED,
      serviceRadiusKm: 4.0,
    },
  });

  await prisma.product.upsert({
    where: { id: 'demo-prod-vitc' },
    update: {},
    create: {
      id: 'demo-prod-vitc',
      shopId: shop2.id,
      name: 'Vitamin C 1000mg Effervescent (20 Tabs)',
      description: 'Immunity booster fizzy orange tablets.',
      price: 29900, // ₹299.00
      unit: 'tube',
      imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80',
      inStock: true,
    },
  });

  // 5. Unapproved shop (to verify it doesn't leak to customer discovery)
  await prisma.shop.upsert({
    where: { id: 'demo-shop-unapproved' },
    update: {},
    create: {
      id: 'demo-shop-unapproved',
      ownerId: merchant.id,
      name: 'Pending Registration Superstore',
      description: 'Awaiting admin verification.',
      category: 'Retail',
      lat: 12.9750,
      lng: 77.6400,
      address: 'Indiranagar 1st Stage',
      status: ShopStatus.PENDING,
      serviceRadiusKm: 5.0,
    },
  });

  console.log('🎉 Demo marketplace data seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
