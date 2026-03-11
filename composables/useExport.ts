/**
 * ============================================================
 * useExport – Export PDF ed Excel
 * ============================================================
 * Genera file di report a partire dalle attività di un giorno:
 *
 * PDF (jsPDF + jsPDF-AutoTable):
 *   - Header arancione con titolo e data
 *   - Box statistiche riassuntive
 *   - Tabella dettagliata delle attività
 *   - Griglia fotografica (max 12 foto, 3 per riga)
 *   - Footer con numero di pagina
 *
 * Excel (SheetJS):
 *   - Foglio "Attività": una riga per ogni attività
 *   - Foglio "Riepilogo": statistiche aggregate per tipo
 */

import { useStore }    from '~/composables/useStore'
import { useGeo }      from '~/composables/useGeo'
import { useAppState } from '~/composables/useAppState'
import { ACT }         from '~/constants'

export function useExport() {
  const store    = useStore()
  const geo      = useGeo()
  const appState = useAppState()

  // ── Utility condivise ────────────────────────────────────────────────

  /**
   * Formatta secondi in stringa leggibile:
   * < 60s → "45s" | < 3600 → "23m" | ≥ 3600 → "2h 15m"
   */
  function fmtDur(seconds: number): string {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      return m > 0 ? `${h}h ${m}m` : `${h}h`
    }
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
    return `${seconds}s`
  }

  /** Formatta un timestamp come "HH:MM". */
  function fmtTime(ts: number | null): string {
    if (!ts) return '—'
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // ─────────────────────────────────────────────────────────────────────
  // EXPORT PDF
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Genera e scarica un report PDF per la data specificata.
   * Usa jsPDF + jsPDF-AutoTable caricati come npm packages.
   */
  async function exportPDF(dateStr: string): Promise<void> {
    const acts = store.forDate(dateStr).slice().sort((a, b) => a.startTime - b.startTime)

    if (!acts.length) {
      appState.showToast('⚠️ Nessuna attività da esportare')
      return
    }

    appState.showToast('⏳ Generazione PDF...')

    try {
      // Import dinamico: evita errori SSR (jsPDF usa window/document)
      const { jsPDF }    = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const dt  = new Date(dateStr + 'T12:00:00')

      const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                         'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
      const DAYS_IT   = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato']

      // ── Header arancione ─────────────────────────────────────────────
      doc.setFillColor(255, 95, 0)
      doc.rect(0, 0, 210, 24, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(19)
      doc.setFont('helvetica', 'bold')
      doc.text('POSATRACK — REPORT GIORNALIERO', 14, 14)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(
        `${DAYS_IT[dt.getDay()]} ${dt.getDate()} ${MONTHS_IT[dt.getMonth()]} ${dt.getFullYear()}`,
        196, 14, { align: 'right' }
      )

      // ── Box statistiche ──────────────────────────────────────────────
      doc.setTextColor(30, 30, 30)
      const completed   = acts.filter(a => a.duration)
      const totalSec    = completed.reduce((s, a) => s + (a.duration ?? 0), 0)
      const pts         = acts.map(a => a.startLoc).filter(Boolean)
      let   totalKm     = 0
      for (let i = 1; i < pts.length; i++) totalKm += geo.dist(pts[i - 1]!, pts[i]!)
      const totalPhotos = acts.reduce((s, a) => s + (a.photos?.length || 0), 0)

      const statsRow: [string, string | number][] = [
        ['Attività totali', acts.length],
        ['Tempo lavorato',  totalSec ? fmtDur(totalSec) : '—'],
        ['Km stimati',      totalKm > 0.05 ? totalKm.toFixed(1) + ' km' : '—'],
        ['Foto scattate',   totalPhotos],
      ]

      doc.setFillColor(247, 247, 247)
      doc.rect(14, 30, 182, 20, 'F')
      statsRow.forEach(([label, value], i) => {
        const x = 22 + i * 46
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text(String(value), x, 38)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(120, 120, 120)
        doc.text(label, x, 44)
      })

      // ── Tabella attività ─────────────────────────────────────────────
      const tableRows = acts.map((a, i) => [
        i + 1,
        ACT[a.type]?.label || a.type,
        a.detail.length > 38 ? a.detail.substring(0, 36) + '…' : a.detail,
        fmtTime(a.startTime),
        fmtTime(a.endTime),
        a.duration ? fmtDur(a.duration) : 'In corso',
        geo.fmt(a.startLoc),
        (a.photos?.length || 0) > 0 ? `📸 ${a.photos.length}` : '—',
      ])

      autoTable(doc, {
        startY:     56,
        head:       [['#', 'Tipo', 'Dettaglio', 'Inizio', 'Fine', 'Durata', 'GPS Inizio', 'Foto']],
        body:       tableRows,
        styles:     { fontSize: 8, cellPadding: 3, font: 'helvetica', overflow: 'linebreak' },
        headStyles: { fillColor: [255, 95, 0] as [number,number,number], textColor: [255, 255, 255] as [number,number,number], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] as [number,number,number] },
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 24 }, 5: { cellWidth: 16 }, 7: { cellWidth: 12 } },
        margin: { left: 14, right: 14 },
      })

      // @ts-expect-error – jsPDF-autotable aggiunge lastAutoTable a doc
      let yPos = (doc as any).lastAutoTable.finalY + 12

      // ── Sezione fotografica (max 12 foto, griglia 3×N) ───────────────
      const allPhotos: { src: string, label: string }[] = []
      acts.forEach(a => {
        a.photos?.forEach(p => allPhotos.push({ src: p.data, label: `${ACT[a.type]?.emoji} ${a.detail}` }))
      })

      if (allPhotos.length > 0) {
        if (yPos > 240) { doc.addPage(); yPos = 14 }

        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(255, 95, 0)
        doc.text('DOCUMENTAZIONE FOTOGRAFICA', 14, yPos)
        yPos += 10
        doc.setTextColor(30, 30, 30)

        const maxPhotos = Math.min(allPhotos.length, 12)
        const cols = 3, imgW = 54, imgH = 42, gap = 5

        for (let i = 0; i < maxPhotos; i++) {
          const col = i % cols
          const row = Math.floor(i / cols)
          const x   = 14 + col * (imgW + gap)
          const y   = yPos + row * (imgH + 12)

          if (row > 0 && col === 0 && y + imgH > 280) {
            doc.addPage()
            yPos = 14 - row * (imgH + 12)
          }

          try {
            doc.addImage(allPhotos[i].src, 'JPEG', x, y, imgW, imgH)
            doc.setFontSize(7)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(100, 100, 100)
            doc.text(allPhotos[i].label.substring(0, 30), x, y + imgH + 4)
          } catch {
            // Foto corrotta o formato non supportato: salta silenziosamente
          }
        }
      }

      // ── Footer su ogni pagina ────────────────────────────────────────
      const totalPages = doc.getNumberOfPages()
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p)
        doc.setFontSize(8)
        doc.setTextColor(180, 180, 180)
        doc.text(
          `PosaTrack · Generato il ${new Date().toLocaleDateString('it-IT')} · Pagina ${p} di ${totalPages}`,
          105, 291, { align: 'center' }
        )
      }

      doc.save(`posatrack_${dateStr}.pdf`)
      appState.showToast('✅ PDF scaricato!')

    } catch (err) {
      console.error('[useExport] Export PDF error:', err)
      appState.showToast('❌ Errore generazione PDF')
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // EXPORT EXCEL
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Genera e scarica un file .xlsx per la data specificata.
   * Contiene due fogli: "Attività" (dettaglio) e "Riepilogo" (per tipo).
   */
  async function exportExcel(dateStr: string): Promise<void> {
    const acts = store.forDate(dateStr).slice().sort((a, b) => a.startTime - b.startTime)

    if (!acts.length) {
      appState.showToast('⚠️ Nessuna attività da esportare')
      return
    }

    appState.showToast('⏳ Generazione Excel...')

    try {
      // Import dinamico: SheetJS usa moduli browser-only
      const XLSX = await import('xlsx')

      const wb = XLSX.utils.book_new()

      // ── Foglio 1: Attività dettagliate ──────────────────────────────
      const activityRows = [
        // Intestazione
        ['#', 'Data', 'Tipo', 'Dettaglio', 'Note',
         'Ora Inizio', 'Ora Fine', 'Durata (min)',
         'GPS Inizio - Lat', 'GPS Inizio - Lng', 'GPS Inizio - Acc (m)',
         'GPS Fine - Lat',   'GPS Fine - Lng',   'N° Foto'],
        // Righe dati
        ...acts.map((a, i) => [
          i + 1,
          a.date,
          ACT[a.type]?.label || a.type,
          a.detail,
          a.note || '',
          fmtTime(a.startTime),
          fmtTime(a.endTime),
          a.duration !== null ? Math.round(a.duration / 60) : '',
          a.startLoc?.lat  || '',
          a.startLoc?.lng  || '',
          a.startLoc?.acc  || '',
          a.endLoc?.lat    || '',
          a.endLoc?.lng    || '',
          a.photos?.length || 0,
        ]),
      ]

      const ws1 = XLSX.utils.aoa_to_sheet(activityRows)
      ws1['!cols'] = [
        { wch: 4 },  { wch: 12 }, { wch: 16 }, { wch: 36 }, { wch: 26 },
        { wch: 10 }, { wch: 10 }, { wch: 14 },
        { wch: 16 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 8 },
      ]
      XLSX.utils.book_append_sheet(wb, ws1, 'Attività')

      // ── Foglio 2: Riepilogo per tipo ────────────────────────────────
      const completed = acts.filter(a => a.duration !== null)
      const totalSec  = completed.reduce((s, a) => s + (a.duration ?? 0), 0)
      const byType: Record<string, number> = {}
      completed.forEach(a => { byType[a.type] = (byType[a.type] || 0) + (a.duration ?? 0) })

      const summaryRows = [
        ['RIEPILOGO GIORNALIERO'],
        ['Data:', dateStr],
        ['Attività totali:', acts.length],
        ['Attività completate:', completed.length],
        ['Tempo totale (min):', Math.round(totalSec / 60)],
        [],
        ['DISTRIBUZIONE PER TIPO'],
        ['Tipo', 'Durata (min)', 'Percentuale'],
        ...Object.keys(byType).map(t => [
          ACT[t]?.label || t,
          Math.round(byType[t] / 60),
          totalSec > 0 ? (Math.round(byType[t] / totalSec * 1000) / 10) + '%' : '—',
        ]),
      ]

      const ws2    = XLSX.utils.aoa_to_sheet(summaryRows)
      ws2['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo')

      XLSX.writeFile(wb, `posatrack_${dateStr}.xlsx`)
      appState.showToast('✅ Excel scaricato!')

    } catch (err) {
      console.error('[useExport] Export Excel error:', err)
      appState.showToast('❌ Errore generazione Excel')
    }
  }

  return { exportPDF, exportExcel }
}
