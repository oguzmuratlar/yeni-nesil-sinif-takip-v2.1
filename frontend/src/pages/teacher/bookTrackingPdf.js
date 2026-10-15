// Kitap Takip Listesi PDF HTML üreticisi (teal temalı, görsel referansa uygun).
// Hem bağımsız PDF indirme hem de ödev PDF'inin sonuna ekleme için ortak kullanılır.
// Veri kaynağı: /api/homework/students/{id}/book-tracking (ekranla aynı).

const INSTAGRAM = {
  'Matematik': '@yeni.nesil.matematiik',
  'Türkçe': '@yeni.nesil.turkce',
  'Fen Bilimleri': '@yeni.nesil.fen.bilimleri',
  'Fen': '@yeni.nesil.fen.bilimleri',
};

const mascotUrl = () => `${window.location.origin}/mascot-books.png`;

const overallPercent = (books = []) =>
  books.length ? Math.round(books.reduce((s, b) => s + (b.progress_percent || 0), 0) / books.length) : 0;

export const buildBookTrackingSection = (tracking) => {
  const { student, branch, unit_columns = [], books = [] } = tracking || {};
  const handle = INSTAGRAM[branch?.name] || '@yeni.nesil.egitim';
  const overall = overallPercent(books);
  const n = unit_columns.length;
  const gridCols = `220px repeat(${n}, 46px)`;

  const unitHeaders = unit_columns
    .map((c) => `<div class="bt-uhead"><span class="bt-uhead-txt">${escapeHtml(c.name)}</span></div>`)
    .join('');

  const numberCells = unit_columns
    .map((_, i) => `<div class="bt-numcell"><span>${i + 1}</span></div>`)
    .join('');

  const rows = books
    .map((b) => {
      const circles = unit_columns
        .map((col) => {
          const cell = b.cells ? b.cells[col.key] : null;
          if (!cell || !cell.present) return `<div class="bt-cc"><span class="bt-circle absent"></span></div>`;
          if (cell.completed) return `<div class="bt-cc"><span class="bt-circle done">&#10003;</span></div>`;
          return `<div class="bt-cc"><span class="bt-circle todo"></span></div>`;
        })
        .join('');
      return `
        <div class="bt-row" style="grid-template-columns:${gridCols}">
          <div class="bt-namecell">
            <span class="bt-name">${escapeHtml(b.name)}</span>
            <span class="bt-pct">%${b.progress_percent}</span>
          </div>
          ${circles}
        </div>`;
    })
    .join('');

  return `
    <div class="bt-wrap">
      <div class="bt-topbar">
        <div class="bt-sinif">
          <span class="bt-sinif-lbl">SINIF</span>
          <span class="bt-sinif-val">${student?.level ? student.level + '.SINIF' : '-'}</span>
        </div>
        <div class="bt-title">
          <span class="bt-student">${escapeHtml(student?.name || '')}</span>
          <span class="bt-maintitle">KİTAP TAKİP LİSTESİ</span>
        </div>
        <div class="bt-check">&#10003;</div>
      </div>

      <div class="bt-body">
        <div class="bt-left">
          <div class="bt-odo">%${overall}</div>
          <img class="bt-mascot" src="${mascotUrl()}" alt="" />
          <div class="bt-handle">${escapeHtml(handle)}</div>
        </div>

        <div class="bt-matrix">
          ${
            books.length === 0
              ? '<p class="bt-empty">Bu branşta atanmış kitap yok.</p>'
              : `
            <div class="bt-grid-head" style="grid-template-columns:${gridCols}">
              <div class="bt-konu">KONU</div>
              ${unitHeaders}
            </div>
            <div class="bt-grid-num" style="grid-template-columns:${gridCols}">
              <div class="bt-kitapadi">KİTAP ADI</div>
              ${numberCells}
            </div>
            <div class="bt-rows">${rows}</div>`
          }
        </div>
      </div>
    </div>`;
};

export const bookTrackingStyles = `
  .bt-wrap { background: #d4f1f4; border-radius: 22px; padding: 16px 18px 22px; font-family: 'Nunito','Manrope',sans-serif; color: #0f4c54; }
  .bt-topbar { background: #1596a3; border-radius: 40px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 10px 18px; gap: 14px; }
  .bt-sinif { display: flex; align-items: center; gap: 10px; }
  .bt-sinif-lbl { color: #fff; font-weight: 800; font-size: 15px; letter-spacing: 1px; }
  .bt-sinif-val { background: #fff; color: #0f4c54; font-weight: 800; font-size: 14px; padding: 8px 26px; border-radius: 20px; }
  .bt-title { display: flex; align-items: center; justify-content: center; gap: 14px; white-space: nowrap; }
  .bt-student { font-family: 'Pacifico', cursive; color: #fdf6e3; font-size: 24px; }
  .bt-maintitle { color: #fff; font-weight: 800; font-size: 22px; letter-spacing: 1px; }
  .bt-check { justify-self: end; width: 34px; height: 34px; border-radius: 50%; background: #22c55e; color: #fff; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center; border: 3px solid #fff; }
  .bt-body { display: flex; gap: 14px; margin-top: 14px; align-items: flex-start; }
  .bt-left { width: 120px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; }
  .bt-odo { background: #fff; border-radius: 12px; padding: 4px 10px; font-weight: 900; font-size: 26px; color: #0f4c54; letter-spacing: 1px; box-shadow: inset 0 0 0 2px #1596a3; }
  .bt-mascot { width: 118px; margin-top: 6px; }
  .bt-handle { writing-mode: vertical-rl; transform: rotate(180deg); color: #1596a3; font-weight: 800; font-size: 13px; letter-spacing: 1px; margin-top: 6px; }
  .bt-matrix { flex: 1; min-width: 0; }
  .bt-grid-head, .bt-grid-num, .bt-row { display: grid; align-items: stretch; gap: 6px; }
  .bt-grid-head { margin-bottom: 6px; }
  .bt-konu { background: #fff; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; color: #0f4c54; }
  .bt-uhead { background: #fff; border-radius: 10px; height: 118px; display: flex; align-items: center; justify-content: center; padding: 6px 2px; }
  .bt-uhead-txt { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 9.5px; font-weight: 700; color: #0f4c54; text-align: left; line-height: 1.1; letter-spacing: .3px; }
  .bt-grid-num { margin-bottom: 8px; }
  .bt-kitapadi { background: #fff; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: #0f4c54; padding: 6px; }
  .bt-numcell { background: #fff; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: #0f4c54; padding: 4px 0; }
  .bt-rows { display: flex; flex-direction: column; gap: 8px; }
  .bt-row { background: #1596a3; border-radius: 30px; padding: 7px 8px; }
  .bt-namecell { background: #fff; border-radius: 20px; display: flex; flex-direction: column; justify-content: center; padding: 4px 14px; }
  .bt-name { font-weight: 800; font-size: 13px; color: #0f4c54; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bt-pct { font-weight: 800; font-size: 10px; color: #1596a3; }
  .bt-cc { display: flex; align-items: center; justify-content: center; }
  .bt-circle { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; font-size: 14px; font-weight: 900; }
  .bt-circle.todo { background: #fff; }
  .bt-circle.done { background: #22c55e; color: #fff; border: 2px solid #fff; }
  .bt-circle.absent { background: rgba(255,255,255,.28); }
  .bt-empty { color: #0f4c54; font-style: italic; padding: 20px; }
`;

// Bağımsız PDF: kendi penceresini açar (landscape).
export const printBookTrackingPdf = (tracking) => {
  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Kitap Takip Listesi - ${escapeHtml(tracking?.student?.name || '')}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Pacifico&display=swap');
      @page { size: A4 landscape; margin: 8mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Nunito', sans-serif; background: #d4f1f4; }
      ${bookTrackingStyles}
      @media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
    </style></head>
    <body>
      ${buildBookTrackingSection(tracking)}
      <script>
        var img = document.querySelector('.bt-mascot');
        function go(){ setTimeout(function(){ window.print(); }, 400); }
        if (img && !img.complete) { img.onload = go; img.onerror = go; } else { go(); }
      </script>
    </body></html>`;
  const w = window.open('', '_blank', 'width=1200,height=800');
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
