'use client';

/**
 * Generates a high-fidelity PDF of the specified element.
 * uses dynamic imports to avoid SSR issues with DOM-heavy libraries.
 */
export async function exportToPdf(element: HTMLElement | null, month: string) {
  if (!element) return;

  try {
    // Dynamically import libraries to prevent server-side errors
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');

    const canvas = await html2canvas(element, {
      scale: 2, // High resolution
      useCORS: true,
      logging: false,
      backgroundColor: null, 
      onclone: (clonedDoc) => {
        // Ensure the cloned element for snapshotting is visible and correctly styled
        const el = clonedDoc.getElementById('snapshot-content');
        if (el) {
          el.style.padding = '20px';
          // Force a consistent background color for the capture
          el.style.backgroundColor = 'hsl(35 30% 95%)';
        }
      }
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const headerHeight = 16;
    const footerHeight = 12;
    const contentHeight = pageHeight - headerHeight - footerHeight;
    const imageHeight = (imgProps.height * pdfWidth) / imgProps.width;
    const pageCount = Math.max(1, Math.ceil(imageHeight / contentHeight));

    for (let page = 0; page < pageCount; page += 1) {
      if (page > 0) pdf.addPage();

      pdf.addImage(imgData, 'PNG', 0, headerHeight - page * contentHeight, pdfWidth, imageHeight);
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pdfWidth, headerHeight, 'F');
      pdf.rect(0, pageHeight - footerHeight, pdfWidth, footerHeight, 'F');
      pdf.setTextColor(24, 24, 24);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text('AZTEC CONTROL CENTER', 10, 9);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.text('EXECUTIVE PERFORMANCE REVIEW', pdfWidth - 10, 9, { align: 'right' });

      pdf.setDrawColor(180, 180, 180);
      pdf.line(10, pageHeight - footerHeight + 1, pdfWidth - 10, pageHeight - footerHeight + 1);
      pdf.setTextColor(90, 90, 90);
      pdf.setFontSize(7);
      pdf.text(`Strategic Client Health Brief · ${month}`, 10, pageHeight - 5);
      pdf.text(`Page ${page + 1} of ${pageCount}`, pdfWidth - 10, pageHeight - 5, { align: 'right' });
    }

    pdf.save(`Aztec_Control_Center_Snapshot_${month}.pdf`);
    
    return true;
  } catch (error) {
    console.error('PDF Export failed:', error);
    throw new Error('Failed to generate PDF. Please check your browser console for details.');
  }
}
