import * as XLSX from 'xlsx';
import { getExportJson } from './api';

// Fetches the currently-filtered audit set and downloads it as a real .xlsx workbook
export async function downloadAuditsExcel(params?: Record<string, string>) {
  const { records } = await getExportJson(params);

  const rows = records.map(r => ({
    Date: new Date(r.date).toLocaleString(),
    Restaurant: r.restaurant,
    Branch: r.branch,
    'Audited By': r.auditedBy,
    Dish: r.dish,
    Score: r.score,
    'Max Score': r.maxScore,
    'Percentage': `${r.percentage}%`,
    Verdict: r.verdict,
    'Overall Comment': r.overallComment,
    'Criteria Breakdown': r.criteria,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 60 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Audits');
  XLSX.writeFile(wb, `food-audit-audits-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
