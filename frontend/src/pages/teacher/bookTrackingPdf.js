// Kitap Takip Listesi PDF HTML üreticisi.
// Hem bağımsız PDF indirme hem de ödev PDF'inin sonuna ekleme için ortak kullanılır.
// Veri kaynağı: /api/homework/students/{id}/book-tracking (ekranla aynı).

export const buildBookTrackingSection = (tracking) => {
  const { student, branch, unit_columns = [], books = [] } = tracking || {};

  const headerCells = unit_columns
    .map((c) => `<th class="bt-unit-th"><div class="bt-unit-label">${escapeHtml(c.name)}</div></th>`)
    .join('');

  const rows = books
    .map((b) => {
      const cells = unit_columns
        .map((col) => {
          const cell = b.cells ? b.cells[col.key] : null;
          if (!cell || !cell.present) {
            return `<td class="bt-cell"><span class="bt-dot bt-absent"></span></td>`;
          }
          if (cell.completed) {
            return `<td class="bt-cell"><span class="bt-dot bt-done">&#10003;</span></td>`;
          }
          return `<td class="bt-cell"><span class="bt-dot bt-todo"></span></td>`;
        })
        .join('');
      return `
        <tr>
          <td class="bt-book">
            <div class="bt-book-name">${escapeHtml(b.name)}</div>
            <div class="bt-book-pct">%${b.progress_percent}</div>
          </td>
          ${cells}
        </tr>`;
    })
    .join('');

  return `
    <div class="bt-section">
      <div class="bt-head">
        <h2>Kitap Takip Listesi</h2>
        <div class="bt-meta">
          <span><b>${escapeHtml(student?.name || '')}</b></span>
          <span>${student?.level ? student.level + '. Sınıf' : ''}</span>
          <span>${escapeHtml(branch?.name || '')}</span>
        </div>
      </div>
      ${
        books.length === 0
          ? '<p class="bt-empty">Bu branşta atanmış kitap yok.</p>'
          : `<table class="bt-table">
              <thead>
                <tr>
                  <th class="bt-book-th">Kitap</th>
                  ${headerCells}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="bt-legend">
              <span><span class="bt-dot bt-done sm">&#10003;</span> Tamamlandı</span>
              <span><span class="bt-dot bt-todo sm"></span> Tamamlanmadı</span>
              <span><span class="bt-dot bt-absent sm"></span> Kitapta yok</span>
            </div>`
      }
    </div>`;
};

export const bookTrackingStyles = `
  .bt-section { padding: 18px 22px; font-family: 'Nunito', sans-serif; color: #1e293b; }
  .bt-head { border-bottom: 3px solid #c7d2fe; padding-bottom: 10px; margin-bottom: 14px; }
  .bt-head h2 { font-size: 20px; font-weight: 800; color: #4338ca; }
  .bt-meta { display: flex; gap: 18px; margin-top: 4px; font-size: 13px; color: #475569; }
  .bt-table { border-collapse: collapse; width: 100%; }
  .bt-table th, .bt-table td { border: 1px solid #e2e8f0; text-align: center; }
  .bt-book-th { background: #eef2ff; color: #4338ca; font-size: 12px; font-weight: 700; padding: 8px 10px; text-align: left; min-width: 160px; }
  .bt-unit-th { background: #eef2ff; color: #4338ca; font-size: 11px; font-weight: 700; padding: 6px 4px; min-width: 42px; max-width: 70px; }
  .bt-unit-label { word-break: break-word; line-height: 1.1; }
  .bt-book { text-align: left; padding: 6px 10px; }
  .bt-book-name { font-size: 12px; font-weight: 700; color: #334155; }
  .bt-book-pct { font-size: 11px; color: #6366f1; font-weight: 700; margin-top: 2px; }
  .bt-cell { padding: 5px; }
  .bt-dot { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; font-size: 11px; font-weight: 800; line-height: 1; }
  .bt-done { background: #22c55e; color: #fff; border: 2px solid #16a34a; }
  .bt-todo { background: #fff; border: 2px solid #cbd5e1; }
  .bt-absent { background: #e2e8f0; border: 2px solid #e2e8f0; }
  .bt-dot.sm { width: 14px; height: 14px; font-size: 9px; vertical-align: middle; }
  .bt-legend { display: flex; gap: 18px; margin-top: 12px; font-size: 11px; color: #475569; align-items: center; }
  .bt-legend span { display: inline-flex; align-items: center; gap: 5px; }
  .bt-empty { color: #94a3b8; font-style: italic; }
`;

// Bağımsız PDF: kendi penceresini açar (landscape).
export const printBookTrackingPdf = (tracking) => {
  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Kitap Takip Listesi - ${escapeHtml(tracking?.student?.name || '')}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Nunito', sans-serif; }
      ${bookTrackingStyles}
      @media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
    </style></head>
    <body>
      ${buildBookTrackingSection(tracking)}
      <script>window.onload=function(){setTimeout(function(){window.print();},500);};</script>
    </body></html>`;
  const w = window.open('', '_blank', 'width=1100,height=760');
  if (w) { w.document.write(html); w.document.close(); return true; }
  return false;
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
