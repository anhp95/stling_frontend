export const downloadCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    console.warn("Exporter: No data provided for CSV download");
    return;
  }

  try {
    const fields = Object.keys(data[0]);
    const csvRows = [];

    // Add header
    csvRows.push(fields.join(','));

    // Add data rows
    for (const row of data) {
      const values = fields.map(field => {
        const val = row[field];
        const escaped = ('' + (val ?? '')).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Exporter: JSON to CSV conversion failed", err);
  }
};

export const downloadJSON = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    console.warn("Exporter: No data provided for JSON download");
    return;
  }

  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename.replace(/\s+/g, '_')}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Exporter: JSON download failed", err);
  }
};
