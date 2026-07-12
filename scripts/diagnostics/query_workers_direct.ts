import mysql from 'mysql2/promise';

async function queryWorkers() {
  const connection = await mysql.createConnection({
    host: 'autorack.proxy.rlwy.net',
    port: 28461,
    user: 'root',
    password: 'kZNQTZqYJEGPPEcCQrAVOWULOqxmqMJe',
    database: 'railway'
  });

  console.log('Connected to database');

  // البحث عن خالد محمد عبدالله الركظه
  const [worker1]: any = await connection.execute(
    "SELECT id, code, full_name, daily_rate, group_id FROM workers WHERE full_name LIKE '%خالد محمد%الركظه%' LIMIT 5"
  );

  console.log('\n=== العامل: خالد محمد عبدالله الركظه ===');
  console.log(JSON.stringify(worker1, null, 2));

  // البحث عن محمد مرغوب ثابت
  const [worker2]: any = await connection.execute(
    "SELECT id, code, full_name, daily_rate, group_id FROM workers WHERE full_name LIKE '%محمد مرغوب%' LIMIT 5"
  );

  console.log('\n=== العامل: محمد مرغوب ثابت ===');
  console.log(JSON.stringify(worker2, null, 2));

  // الحصول على معلومات مجموعة الأمن
  if (worker1.length > 0 && worker1[0].group_id) {
    const [groupInfo]: any = await connection.execute(
      "SELECT * FROM groups WHERE id = ? LIMIT 1",
      [worker1[0].group_id]
    );
    
    console.log('\n=== معلومات مجموعة الأمن ===');
    console.log(JSON.stringify(groupInfo, null, 2));
  }

  await connection.end();
  process.exit(0);
}

queryWorkers().catch(console.error);
