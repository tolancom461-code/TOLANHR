import { useState } from "react";
import { trpc } from "../lib/trpc";

const QUERIES = {
  1: {
    title: "1️⃣ معلومات الدفعة",
    description: "تفاصيل Batch-2026-02-001-99ms",
    query: `SELECT 
  batch_id,
  period_start,
  period_end,
  cost_center_id,
  created_at,
  status
FROM payroll_batches
WHERE batch_id = 'Batch-2026-02-001-99ms';`,
  },
  2: {
    title: "2️⃣ عدد العناصر في الدفعة",
    description: "كم عامل في الدفعة",
    query: `SELECT COUNT(*) as item_count
FROM payroll_batch_items pbi
JOIN payroll_batches pb ON pbi.batch_id = pb.id
WHERE pb.batch_id = 'Batch-2026-02-001-99ms';`,
  },
  3: {
    title: "3️⃣ البصمات في 25 فبراير",
    description: "من حضر في 25 فبراير؟",
    query: `SELECT 
  w.full_name,
  g.name as group_name,
  ae.event_type,
  ae.event_time,
  ae.work_date
FROM attendance_events ae
LEFT JOIN workers w ON ae.worker_id = w.id
LEFT JOIN groups g ON w.group_id = g.id
WHERE ae.work_date = '2026-02-25'
ORDER BY ae.event_time
LIMIT 50;`,
  },
  4: {
    title: "4️⃣ السجلات المالية في 25 فبراير",
    description: "هل تم إنشاء سجلات مالية؟",
    query: `SELECT 
  w.full_name,
  g.name as group_name,
  wdf.base_amount,
  wdf.net_amount,
  wdf.created_at
FROM worker_daily_finance wdf
LEFT JOIN workers w ON wdf.worker_id = w.id
LEFT JOIN groups g ON w.group_id = g.id
WHERE wdf.work_date = '2026-02-25'
ORDER BY wdf.created_at
LIMIT 50;`,
  },
  5: {
    title: "5️⃣ جميع دفعات الرواتب",
    description: "قائمة كل الدفعات",
    query: `SELECT 
  batch_id,
  period_start,
  period_end,
  created_at,
  status,
  (SELECT COUNT(*) FROM payroll_batch_items WHERE batch_id = payroll_batches.id) as items_count
FROM payroll_batches
ORDER BY created_at DESC
LIMIT 10;`,
  },
  6: {
    title: "6️⃣ المجموعات والرواتب",
    description: "رواتب المجموعات",
    query: `SELECT 
  id,
  name,
  daily_salary,
  updated_at
FROM groups
ORDER BY name;`,
  },
};

export default function DatabaseConsole() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const dbQueryMutation = trpc.dbQuery.useMutation();

  const executeQuery = async () => {
    if (!query.trim()) {
      setResult({ error: "الرجاء إدخال استعلام SQL" });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const data = await dbQueryMutation.mutateAsync({ query });
      setResult(data);
    } catch (error: any) {
      setResult({ error: error.message || "حدث خطأ في تنفيذ الاستعلام" });
    } finally {
      setIsLoading(false);
    }
  };

  const loadQuery = (num: number) => {
    const q = QUERIES[num as keyof typeof QUERIES];
    if (q) {
      setQuery(q.query);
      setResult(null);
    }
  };

  const clearQuery = () => {
    setQuery("");
    setResult(null);
  };

  const renderTable = (rows: any[]) => {
    if (!rows || rows.length === 0) return null;

    const columns = Object.keys(rows[0]);

    return (
      <div className="overflow-auto max-h-96 mt-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="bg-indigo-600 text-white font-bold p-2 border border-gray-300 sticky top-0 text-left"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                {columns.map((col) => {
                  let value = row[col];
                  if (value === null) value = <em className="text-gray-400">NULL</em>;
                  else if (typeof value === "object") value = JSON.stringify(value);
                  else if (typeof value === "string" && value.length > 100) {
                    value = value.substring(0, 100) + "...";
                  }
                  return (
                    <td key={col} className="p-2 border border-gray-300">
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-6">
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-2xl p-8">
        <h1 className="text-4xl font-bold text-indigo-600 mb-2">
          🗄️ استعلامات Batch-2026-02-001-99ms
        </h1>
        <p className="text-gray-600 mb-6">تحليل سبب فراغ الدفعة رغم وجود بصمات في 25 فبراير</p>

        <div className="bg-gray-50 border-l-4 border-indigo-600 p-6 rounded-lg mb-6">
          <h3 className="text-xl font-bold text-indigo-600 mb-4">📋 الاستعلامات الجاهزة</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(QUERIES).map(([num, q]) => (
              <button
                key={num}
                onClick={() => loadQuery(Number(num))}
                className="p-4 bg-white border-2 border-gray-200 rounded-lg hover:border-indigo-600 hover:bg-indigo-50 transition-all text-right"
              >
                <h4 className="text-indigo-600 font-bold mb-1 text-sm">{q.title}</h4>
                <p className="text-gray-600 text-xs mb-2">{q.description}</p>
                <p className="text-gray-400 text-xs font-mono text-left truncate">
                  {q.query.split("\n")[0]}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="query" className="block mb-2 font-bold text-gray-700">
            📝 استعلام SQL مخصص:
          </label>
          <textarea
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === "Enter") {
                e.preventDefault();
                executeQuery();
              }
            }}
            placeholder="أدخل استعلام SQL هنا أو اختر من الاستعلامات الجاهزة أعلاه..."
            className="w-full min-h-[200px] p-4 border-2 border-gray-300 rounded-lg font-mono text-sm resize-y focus:outline-none focus:border-indigo-600 text-left"
            dir="ltr"
          />
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={executeQuery}
            disabled={isLoading}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "⏳ جاري التنفيذ..." : "▶️ تنفيذ الاستعلام"}
          </button>
          <button
            onClick={clearQuery}
            className="px-6 py-3 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition-all"
          >
            🗑️ مسح
          </button>
        </div>

        {result && (
          <div className="mt-6">
            {result.error ? (
              <div className="p-4 bg-red-100 border border-red-300 rounded-lg text-red-700">
                ❌ خطأ: {result.error}
              </div>
            ) : result.rows && result.rows.length > 0 ? (
              <div>
                <div className="p-4 bg-green-100 border border-green-300 rounded-lg text-green-700 mb-4">
                  ✅ تم التنفيذ بنجاح - {result.rows.length} صف
                </div>
                {renderTable(result.rows)}
              </div>
            ) : result.rows && result.rows.length === 0 ? (
              <div className="p-4 bg-green-100 border border-green-300 rounded-lg text-green-700">
                ✅ تم التنفيذ بنجاح - لا توجد نتائج
              </div>
            ) : result.affectedRows !== undefined ? (
              <div className="p-4 bg-green-100 border border-green-300 rounded-lg text-green-700">
                ✅ تم التنفيذ بنجاح - {result.affectedRows} صف متأثر
              </div>
            ) : (
              <div className="p-4 bg-green-100 border border-green-300 rounded-lg text-green-700">
                ✅ تم التنفيذ بنجاح
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
