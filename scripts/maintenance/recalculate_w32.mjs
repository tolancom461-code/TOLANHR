#!/usr/bin/env node
/**
 * Recalculate worker W32 daily finance for the period
 */

// Set DATABASE_URL
process.env.DATABASE_URL = 'mysql://24yVnB8NmZGjEKv.root:Vw3IXZd5syQI1J2V@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/test?ssl={"rejectUnauthorized":true}';

import { calculateDailyFinancesForPeriod } from './server/db.ts';

async function main() {
  try {
    console.log('🔄 Recalculating daily finances for period 2026-02-01 to 2026-02-15...');
    
    const result = await calculateDailyFinancesForPeriod(
      330007, // Worker ID for W32
      '2026-02-01',
      '2026-02-15'
    );
    
    console.log('✅ Calculation completed!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

main();
