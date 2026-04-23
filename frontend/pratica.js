document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const praticaName = urlParams.get('name');
    
    window.globalBatchData = [];
    window._lastPraticaName = praticaName;
    
    if (!praticaName) {
        document.getElementById('pratica-title').textContent = "Nome Pratica Non Trovato";
        document.getElementById('loading').innerHTML = "Nessun parametro dossier fornito. Operazione annullata.";
        return;
    }
    
    document.getElementById('pratica-title').textContent = `Dossier: ${praticaName}`;
    
    try {
        const response = await fetch(`/api/pratica/${encodeURIComponent(praticaName)}`);
        if (!response.ok) throw new Error(`Restituzione fallita dal database. Pratica inesistente o errore server.`);
        
        const data = await response.json();
        const docs = data.documents || [];
        
        document.getElementById('loading').remove();
        const container = document.getElementById('master-matrix-container');
        container.style.display = 'block';
        
        if (docs.length === 0) {
            container.innerHTML = `<p style="padding: 2rem; color: var(--color-tan); font-style: italic;">Nessun documento trovato salvato archiviato in questo dossier.</p>`;
            return;
        }
        
        docs.forEach(doc => {
            window.globalBatchData.push({
                file: { name: doc.filename },
                docId: doc.id,
                extracted: doc.extracted_data || {}
            });
        });
        
        renderMasterMatrix(praticaName);
        
        // Initialize search
        const searchInput = document.getElementById('pratica-search');
        if (searchInput) {
            searchInput.style.display = 'block';
            searchInput.addEventListener('input', (e) => {
                renderMasterMatrix(praticaName, e.target.value.toLowerCase());
            });
        }
        
    } catch (err) {
        document.getElementById('loading').innerHTML = `<p style="color: var(--color-coral); text-align: left;">Criticità: ${err.message}</p>`;
    }
});

window.currentSort = { key: null, type: null, asc: true };

window.getSortIcon = function(type, key) {
    if (window.currentSort.type === type && window.currentSort.key === key) {
        return window.currentSort.asc ? ' ▲' : ' ▼';
    }
    return '';
};

window.sortTable = function(type, key) {
    if (window.currentSort.key === key && window.currentSort.type === type) {
        window.currentSort.asc = !window.currentSort.asc;
    } else {
        window.currentSort = { key, type, asc: true };
    }

    const direction = window.currentSort.asc ? 1 : -1;

    window.globalBatchData.sort((a, b) => {
        let valA = ''; let valB = '';
        if (type === 'file') {
            valA = a.file.name; valB = b.file.name;
        } else if (type === 'meta') {
            valA = a.extracted.metadata?.[key] || '';
            valB = b.extracted.metadata?.[key] || '';
        } else if (type === 'field') {
            valA = a.extracted.fields?.[key] || '';
            valB = b.extracted.fields?.[key] || '';
        }

        let compA = valA; let compB = valB;
        if(typeof valA === 'string' && typeof valB === 'string') {
            const cleanA = valA.replace(/,/g, '').trim();
            const cleanB = valB.replace(/,/g, '').trim();
            if (valA !== '' && valB !== '' && !isNaN(parseFloat(cleanA)) && !isNaN(parseFloat(cleanB))) {
                compA = parseFloat(cleanA);
                compB = parseFloat(cleanB);
            } else {
                compA = valA.toLowerCase();
                compB = valB.toLowerCase();
            }
        }
        
        if (compA < compB) return -1 * direction;
        if (compA > compB) return 1 * direction;
        return 0;
    });

    renderMasterMatrix(window._lastPraticaName);
};

window.collapsedColumns = new Set();
window.toggleColumn = function(index, name) {
    if (window.collapsedColumns.has(index)) {
        window.collapsedColumns.delete(index);
    } else {
        window.collapsedColumns.add(index);
    }
    renderMasterMatrix(name);
};

window.renderMasterMatrix = function(praticaName, filterStr = "") {
    const container = document.getElementById('master-matrix-container');
    if (window.globalBatchData.length === 0) return;

    const allFieldKeys = new Set();
    window.globalBatchData.forEach(item => {
        const fields = item.extracted.fields || {};
        Object.keys(fields).forEach(k => allFieldKeys.add(k));
    });
    const fieldKeyArray = Array.from(allFieldKeys);

    const fsBtn = document.getElementById('fullscreen-btn');
    if(fsBtn) fsBtn.style.display = 'inline-block';
    const exBtn = document.getElementById('export-excel-btn');
    if(exBtn) exBtn.style.display = 'inline-block';
    const pkgBtn = document.getElementById('full-package-btn');
    if(pkgBtn) pkgBtn.style.display = 'inline-block';

    let html = `<button class="exit-fullscreen-btn" onclick="document.getElementById('master-matrix-container').classList.remove('master-matrix-container-fullscreen')">✖ Esci da Pieno Schermo</button>`;
    html += `<div style="overflow: auto; flex: 1; width: 100%;"><table class="excel-table master-excel-table" style="box-shadow: 0 4px 6px rgba(166,139,99,0.08);">
        <thead>
            <tr>
                <th class="${window.collapsedColumns.has(0) ? 'collapsed-col' : ''}" onclick="${window.collapsedColumns.has(0) ? 'window.toggleColumn(0)' : "sortTable('file', 'name')"}" style="background-color: var(--color-sage); color: white; cursor: pointer;">
                    <div class="th-content-wrapper">
                        Nome File ${getSortIcon('file','name')}
                        <button class="col-toggle-btn" onclick="event.stopPropagation(); window.toggleColumn(0, '${name}')">${window.collapsedColumns.has(0) ? '+' : '-'}</button>
                    </div>
                </th>
                <th class="${window.collapsedColumns.has(1) ? 'collapsed-col' : ''}" onclick="${window.collapsedColumns.has(1) ? 'window.toggleColumn(1)' : "sortTable('meta', 'category')"}" style="background-color: var(--color-sage); color: white; cursor: pointer;">
                    <div class="th-content-wrapper">
                        Categoria ${getSortIcon('meta','category')}
                        <button class="col-toggle-btn" onclick="event.stopPropagation(); window.toggleColumn(1, '${name}')">${window.collapsedColumns.has(1) ? '+' : '-'}</button>
                    </div>
                </th>
                <th class="${window.collapsedColumns.has(2) ? 'collapsed-col' : ''}" onclick="${window.collapsedColumns.has(2) ? 'window.toggleColumn(2)' : "sortTable('meta', 'label')"}" style="background-color: var(--color-sage); color: white; cursor: pointer;">
                    <div class="th-content-wrapper">
                        Sottocategoria ${getSortIcon('meta','label')}
                        <button class="col-toggle-btn" onclick="event.stopPropagation(); window.toggleColumn(2, '${name}')">${window.collapsedColumns.has(2) ? '+' : '-'}</button>
                    </div>
                </th>
                <th class="${window.collapsedColumns.has(3) ? 'collapsed-col' : ''}" onclick="${window.collapsedColumns.has(3) ? 'window.toggleColumn(3)' : "sortTable('meta', 'data_documento')"}" style="background-color: var(--color-sage); color: white; cursor: pointer;">
                    <div class="th-content-wrapper">
                        Data Atto ${getSortIcon('meta','data_documento')}
                        <button class="col-toggle-btn" onclick="event.stopPropagation(); window.toggleColumn(3, '${name}')">${window.collapsedColumns.has(3) ? '+' : '-'}</button>
                    </div>
                </th>
                <th class="${window.collapsedColumns.has(4) ? 'collapsed-col' : ''}" onclick="${window.collapsedColumns.has(4) ? 'window.toggleColumn(4)' : "sortTable('meta', 'data_protocollo')"}" style="background-color: var(--color-sage); color: white; cursor: pointer;">
                    <div class="th-content-wrapper">
                        Data Prot. ${getSortIcon('meta','data_protocollo')}
                        <button class="col-toggle-btn" onclick="event.stopPropagation(); window.toggleColumn(4, '${name}')">${window.collapsedColumns.has(4) ? '+' : '-'}</button>
                    </div>
                </th>`;
    
    fieldKeyArray.forEach((k, i) => {
        const colIdx = i + 5;
        const escapedK = k.replace(/'/g, "\\'");
        html += `<th class="${window.collapsedColumns.has(colIdx) ? 'collapsed-col' : ''}" onclick="${window.collapsedColumns.has(colIdx) ? `window.toggleColumn(${colIdx})` : `sortTable('field', '${escapedK}')`}" style="background-color: var(--color-tan); color: white; cursor: pointer;">
                    <div class="th-content-wrapper">
                        ${k.charAt(0).toUpperCase() + k.slice(1)} ${getSortIcon('field', k)}
                        <button class="col-toggle-btn" onclick="event.stopPropagation(); window.toggleColumn(${colIdx}, '${name}')">${window.collapsedColumns.has(colIdx) ? '+' : '-'}</button>
                    </div>
                </th>`;
    });
    
    html += `</tr></thead><tbody>`;

    const filterMatch = (item) => {
        if (!filterStr) return true;
        const fileName = item.file.name.toLowerCase();
        const meta = item.extracted.metadata || {};
        const fields = item.extracted.fields || {};
        
        if (fileName.includes(filterStr)) return true;
        if (Object.values(meta).some(v => String(v).toLowerCase().includes(filterStr))) return true;
        if (Object.values(fields).some(v => {
            const val = (typeof v === 'object' && v !== null && 'value' in v) ? v.value : v;
            return String(val).toLowerCase().includes(filterStr);
        })) return true;
        return false;
    };

    window.globalBatchData.forEach((item, index) => {
        if (!filterMatch(item)) return;
        const meta = item.extracted.metadata || {};
        const fields = item.extracted.fields || {};
        
        html += `<tr>
            <td class="${window.collapsedColumns.has(0) ? 'collapsed-col' : ''}"><a href="#" onclick="openPDFModal(${index}); return false;" style="color: var(--color-olive); text-decoration: underline; font-weight: 600;">${item.file.name}</a></td>
            <td class="${window.collapsedColumns.has(1) ? 'collapsed-col' : ''}">${meta.category || '-'}</td>
            <td class="${window.collapsedColumns.has(2) ? 'collapsed-col' : ''}" style="color: var(--color-sage); font-weight: 500;">${meta.label || '-'}</td>
            <td class="${window.collapsedColumns.has(3) ? 'collapsed-col' : ''}">${meta.data_documento || '-'}</td>
            <td class="${window.collapsedColumns.has(4) ? 'collapsed-col' : ''}">${meta.data_protocollo || '-'}</td>`;
            
        fieldKeyArray.forEach((k, i) => {
            const colIdx = i + 5;
            const entry = fields[k] || {};
            const val = (typeof entry === 'object' && entry !== null && 'value' in entry) ? entry.value : entry;
            const conf = (typeof entry === 'object' && entry !== null && 'confidence' in entry) ? entry.confidence : null;
            
            let style = "";
            let indicator = "";
            if (conf !== null) {
                if (conf < 75) {
                    style = "background: rgba(255,107,107,0.1); color: #d63031;";
                    indicator = `<span title="Confidenza Bassa: ${conf}%" style="font-size: 0.8rem; margin-left: 4px; cursor: help;">⚠️</span>`;
                } else if (conf < 90) {
                    style = "background: rgba(243,156,18,0.1);";
                    indicator = `<span title="Confidenza Media: ${conf}%" style="font-size: 0.8rem; margin-left: 4px; opacity: 0.7;">🟡</span>`;
                }
            }

            html += `<td class="${window.collapsedColumns.has(colIdx) ? 'collapsed-col' : ''}" style="${style}">${val === undefined || val === null || val === "" ? '-' : val}${indicator}</td>`;
        });
        html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

window.openPDFModal = function(index) {
    const item = window.globalBatchData[index];
    if(!item) return;
    
    const modal = document.getElementById('pdf-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    title.textContent = `Visualizzatore Documento: ${item.file.name}`;
    const id = item.docId || item.id || item.doc_id;
    const fileUrl = id ? `/api/documents/${id}/pdf` : (item.file instanceof File ? URL.createObjectURL(item.file) : "");
    body.innerHTML = `<iframe src="${fileUrl}" width="100%" height="100%" style="border:none; border-radius:var(--radius-md);"></iframe>`;
    
    modal.classList.add('show');
};

window.closePDFModal = function() {
    const modal = document.getElementById('pdf-modal');
    const body = document.getElementById('modal-body');
    modal.classList.remove('show');
    body.innerHTML = '';
};

window.exportToCSV = function() {
    if (window.globalBatchData.length === 0) return;

    const allFieldKeys = new Set();
    window.globalBatchData.forEach(item => {
        const fields = item.extracted.fields || {};
        Object.keys(fields).forEach(k => allFieldKeys.add(k));
    });
    const fieldKeyArray = Array.from(allFieldKeys);

    let csv = '\uFEFF'; 
    const headers = ['Nome File', 'Categoria', 'Sottocategoria', 'Data Atto', 'Data Protocollo', ...fieldKeyArray];
    csv += headers.join(';') + '\n';

    window.globalBatchData.forEach(item => {
        const meta = item.extracted.metadata || {};
        const fields = item.extracted.fields || {};
        const row = [
            item.file.name,
            meta.category || '',
            meta.label || '',
            meta.data_documento || '',
            meta.data_protocollo || ''
        ];
        fieldKeyArray.forEach(k => {
            const entry = fields[k] || "";
            const val = (typeof entry === 'object' && entry !== null && 'value' in entry) ? entry.value : entry;
            row.push(val === undefined || val === null ? '' : val);
        });
        csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Dossier_${window._lastPraticaName || 'Export'}_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.downloadFullPackage = async function() {
    const btn = document.getElementById('full-package-btn');
    const originalText = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = `<span>⏳ Generazione in corso...</span>`;
        btn.style.opacity = "0.7";
        btn.style.cursor = "wait";

        const name = window._lastPraticaName;
        const response = await fetch(`/api/pratica/${encodeURIComponent(name)}/full-package`);
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Errore durante la generazione del pacchetto.");
        }

        const blob = await response.blob();
        
        // Extract filename from header if possible
        const disposition = response.headers.get('Content-Disposition');
        let filename = `Pacchetto_${name}.zip`;
        if (disposition && disposition.indexOf('filename=') !== -1) {
            filename = disposition.split('filename=')[1].split(';')[0].replace(/"/g, '');
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (err) {
        console.error(err);
        alert(`Impossibile generare il pacchetto: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
    }
};
