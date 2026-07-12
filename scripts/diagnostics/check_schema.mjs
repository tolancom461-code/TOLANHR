import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '2aLErcqkQ5WYvxE.root',
  password: 'Tolan@2024',
  database: 'test',
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  }
});

try {
  // Check groups table structure
  const [columns] = await connection.execute('DESCRIBE groups');
  console.log('=== Groups Table Columns ===');
  console.table(columns);
  
  // Check if daily_wage column exists
  const dailyWageCol = columns.find(col => col.Field === 'daily_wage');
  if (dailyWageCol) {
    console.log('\n✅ daily_wage column EXISTS');
    console.log('Type:', dailyWageCol.Type);
    console.log('Null:', dailyWageCol.Null);
    console.log('Default:', dailyWageCol.Default);
  } else {
    console.log('\n❌ daily_wage column DOES NOT EXIST');
  }
  
  // Check actual data
  const [rows] = await connection.execute('SELECT id, code, name, daily_wage FROM groups WHERE id = 330003');
  console.log('\n=== Group 330003 Data ===');
  console.table(rows);
  
} catch (error) {
  console.error('Error:', error);
} finally {
  await connection.end();
}
