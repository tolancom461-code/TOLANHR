// Call API to recalculate finance for specific workers on 2026-02-25
const workerIds = [420006, 420007, 420008];
const workDate = '2026-02-25';

console.log('=== Triggering finance recalculation via API ===\n');

for (const workerId of workerIds) {
  try {
    const url = `https://www.tolanhr.com/api/trpc/processAttendanceToFinance?batch=1&input=${encodeURIComponent(JSON.stringify({
      "0": { workerId, workDate }
    }))}`;
    
    console.log(`Worker ${workerId}: Calling API...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Success:`, data);
    } else {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
    }
    
  } catch (error) {
    console.error(`❌ Error for worker ${workerId}:`, error.message);
  }
  
  console.log('');
}

console.log('=== Done ===');
