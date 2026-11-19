import { resetAndSeedMarketplace } from './resetAndSeedMarketplace.js';

resetAndSeedMarketplace()
  .catch((e) => {
    console.error('Error seeding demo data:', e);
    process.exit(1);
  });
