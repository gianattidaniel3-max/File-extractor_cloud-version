document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const toast = document.getElementById('toast');
    
    window.globalBatchData = [];

    // UI Events
    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
    });

    dropzone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files), false);

    function handleDrop(e) {
        handleFiles(e.dataTransfer.files);
    }

    let stagedFiles = [];
    const batchContainer = document.getElementById('section-batch');
    const batchFileList = document.getElementById('batch-file-list');
    const startBatchBtn = document.getElementById('start-batch-btn');
    const cancelBatchBtn = document.getElementById('cancel-batch-btn');

    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    async function handleFiles(files) {
        if (!files || files.length === 0) return;
        
        Array.from(files).forEach(f => {
            if (f.type === 'application/pdf') {
                stagedFiles.push({
                    file: f,
                    split: false,
                    ranges: "" // String like "1-2, 3-3"
                });
            } else {
                showToast(`Saltato ${f.name}: Solo PDF.`, true);
            }
        });

        renderBatchList();
    }

    function renderBatchList() {
        if (stagedFiles.length === 0) {
            batchContainer.style.display = 'none';
            return;
        }

        batchContainer.style.display = 'block';
        batchContainer.classList.remove('collapsed');
        batchFileList.innerHTML = stagedFiles.map((item, idx) => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.8rem; box-shadow: inset 0 1px 3px rgba(0,0,0,0.02);">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; font-weight: 500;" title="${item.file.name}">
                    <strong style="color: var(--color-olive); margin-right: 4px;">${idx + 1}.</strong> ${item.file.name}
                </span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    ${item.split ? `<span style="background: var(--color-terracotta); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 700;">TAGLI: ${item.ranges}</span>` : ''}
                    <button onclick="window.openSplitModal(${idx})" style="background: transparent; border: 1px solid var(--color-tan); color: var(--color-olive); padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        ${item.split ? 'Modifica' : 'Dividi'}
                    </button>
                </div>
            </div>
        `).join('');
    }

    window.addSplitRangeRow = (start = 1, end = 1) => {
        const list = document.getElementById('split-ranges-list');
        const row = document.createElement('div');
        row.className = 'split-range-row';
        row.style = "display: flex; align-items: center; gap: 0.4rem; background: var(--bg-surface); padding: 0.3rem 0.6rem; border-radius: 6px; border: 1px solid var(--color-tan);";
        row.innerHTML = `
            <input type="number" class="range-start" value="${start}" min="1" style="width: 45px; border:none; background:transparent; font-size:0.85rem; font-weight:600; text-align:center;">
            <span style="color: var(--color-tan); font-weight:bold;">-</span>
            <input type="number" class="range-end" value="${end}" min="1" style="width: 45px; border:none; background:transparent; font-size:0.85rem; font-weight:600; text-align:center;">
            <button onclick="this.parentElement.remove()" style="background:transparent; border:none; color:var(--color-terracotta); cursor:pointer; font-size: 1rem; padding:0;">×</button>
        `;
        list.appendChild(row);
    };

    window.applyAutoSplit = () => {
        const chunk = parseInt(document.getElementById('split-batch-chunk').value) || 1;
        const info = document.getElementById('split-info-text').textContent;
        const match = info.match(/\d+/);
        if (!match) return alert("Pagine non ancora caricate.");
        const total = parseInt(match[0]);
        
        document.getElementById('split-ranges-list').innerHTML = '';
        for (let i = 1; i <= total; i += chunk) {
            window.addSplitRangeRow(i, Math.min(i + chunk - 1, total));
        }
    };

    window.openSplitModal = async (idx) => {
        const item = stagedFiles[idx];
        const modal = document.getElementById('pdf-modal');
        const grid = document.getElementById('pdf-grid-container');
        const content = modal.querySelector('.modal-content');
        const infoText = document.getElementById('split-info-text');
        const saveBtn = document.getElementById('save-split-config-btn');
        const modalTitle = document.getElementById('modal-title');
        const rangesList = document.getElementById('split-ranges-list');

        modalTitle.textContent = `Gestione Tagli: ${item.file.name}`;
        content.classList.add('wide');
        modal.classList.add('show');
        
        // Modal management: show grid, hide viewer, show controls
        grid.style.display = 'grid';
        document.getElementById('pdf-view-container').style.display = 'none';
        const splitBar = document.getElementById('split-controls-bar');
        if (splitBar) splitBar.style.display = 'flex';
        
        grid.innerHTML = '<div style="padding: 2rem; color: var(--color-tan); font-weight: 500;">Caricamento anteprime...</div>';
        rangesList.innerHTML = '';

        const splitPoints = new Set(); // Stores page indices AFTER which there is a cut

        try {
            // Stability fix: Load as ArrayBuffer instead of Blob URL
            const arrayBuffer = await item.file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const totalPages = pdf.numPages;
            infoText.textContent = `Pagine rilevate: ${totalPages}`;
            grid.innerHTML = '';

            // Restore previous ranges if they exist
            if (item.ranges) {
                const parts = item.ranges.split(',').map(r => r.trim());
                parts.forEach(p => {
                    const r = p.split('-').map(v => parseInt(v.trim()));
                    if (r.length === 2) {
                        for (let i = r[0]; i < r[1]; i++) splitPoints.add(i);
                        splitPoints.add(r[1]); // This logic is slightly different: we mark the END of one document
                    } else if (!isNaN(r[0])) {
                        splitPoints.add(r[0]);
                    }
                });
                // Note: The logic for set of 'cuts' is: if I have range 1-2, 3-5, my cuts are at page 2.
                // Re-calculating cuts correctly from existing ranges:
                splitPoints.clear();
                parts.forEach(p => {
                    const end = parseInt(p.split('-').pop());
                    if (end < totalPages) splitPoints.add(end);
                });
            }

            for (let i = 1; i <= totalPages; i++) {
                const pageWrapper = document.createElement('div');
                pageWrapper.className = 'page-wrapper';
                
                const thumbBox = document.createElement('div');
                thumbBox.className = 'page-thumbnail-box';
                const canvas = document.createElement('canvas');
                thumbBox.appendChild(canvas);
                pageWrapper.appendChild(thumbBox);

                const label = document.createElement('div');
                label.className = 'page-number-label';
                label.textContent = `Pagina ${i}`;
                pageWrapper.appendChild(label);

                // Add Cut Zone after each page except the last
                if (i < totalPages) {
                    const zone = document.createElement('div');
                    zone.className = 'split-zone';
                    if (splitPoints.has(i)) zone.classList.add('active');
                    
                    const line = document.createElement('div');
                    line.className = 'split-line';
                    zone.appendChild(line);
                    
                    zone.onclick = () => {
                        if (splitPoints.has(i)) {
                            splitPoints.delete(i);
                            zone.classList.remove('active');
                        } else {
                            splitPoints.add(i);
                            zone.classList.add('active');
                        }
                        updateRangesUI();
                    };
                    pageWrapper.appendChild(zone);
                }

                grid.appendChild(pageWrapper);

                // Render Thumbnail
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.3 }); // Small thumbnail
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            }

            const updateRangesUI = () => {
                const cuts = Array.from(splitPoints).sort((a,b) => a - b);
                const ranges = [];
                let start = 1;
                cuts.forEach(c => {
                    ranges.push(start === c ? `${start}` : `${start}-${c}`);
                    start = c + 1;
                });
                ranges.push(start === totalPages ? `${totalPages}` : `${start}-${totalPages}`);
                
                rangesList.innerHTML = '';
                ranges.forEach(r => {
                    const badge = document.createElement('span');
                    badge.className = 'badge';
                    badge.style.background = 'var(--color-terracotta)';
                    badge.textContent = `Doc: ${r}`;
                    rangesList.appendChild(badge);
                });
                
                item.temp_ranges = ranges.join(', ');
            };

            updateRangesUI();

        } catch (err) {
            console.error("PDF Loading Error:", err);
            grid.innerHTML = `<div style="color: var(--color-coral); padding: 2rem;">Impossibile generare anteprime: ${err.message}</div>`;
        }

        saveBtn.onclick = () => {
            if (item.temp_ranges) {
                item.split = item.temp_ranges.split(',').length > 1;
                item.ranges = item.temp_ranges;
                delete item.temp_ranges;
            }
            renderBatchList();
            closePDFModal();
            content.classList.remove('wide');
        };
    };

    window.toggleSplit = (idx) => {
        stagedFiles[idx].split = !stagedFiles[idx].split;
    };

    cancelBatchBtn.onclick = () => {
        stagedFiles = [];
        renderBatchList();
    };

    startBatchBtn.onclick = async () => {
        if (stagedFiles.length === 0) return;

        let praticaName = await openPraticaSelectionModal();
        if (!praticaName) return; 

        const filesToProcess = [...stagedFiles];
        stagedFiles = [];
        renderBatchList();

        const total = filesToProcess.length;
        let processed = 0;
        
        const liveStatus = document.getElementById('batch-live-status');
        const liveText = document.getElementById('batch-live-text');
        
        if(liveStatus) liveStatus.style.display = 'flex';

        for (const item of filesToProcess) {
            processed++;
            if(liveText) liveText.textContent = `Analisi ${processed}/${total}: ${item.file.name}`;
            
            if (item.split) {
                await processSplitFile(item.file, praticaName, item.ranges);
            } else {
                await uploadAndProcessFile(item.file, praticaName);
            }
            renderMasterMatrix(praticaName);
        }

        if(liveStatus) liveStatus.style.display = 'none';
    };

    async function processSplitFile(file, praticaName, ranges) {
        showToast(`Suddivisione di ${file.name} (tronconi: ${ranges})...`);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('ranges', ranges);
        
        try {
            const res = await fetch('/api/split', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.status === "success") {
                for (const filename of data.files) {
                    await uploadByServerPath(filename, praticaName);
                }
            }
        } catch (err) {
            showToast(`Errore split: ${err.message}`, true);
        }
    }

    async function uploadByServerPath(filename, praticaName) {
        showToast(`Analisi ${filename}...`);
        
        const formData = new FormData();
        formData.append('server_filename', filename);
        if (praticaName) formData.append('pratica', praticaName);
        formData.append('ai_context', document.getElementById('ai-context-input')?.value || "");
        formData.append('schema', JSON.stringify({ 
            schema_type: "Strict Italian Legal Taxonomy Extraction",
            taxonomy: window.appSchema?.taxonomy || {},
            expected_fields_per_type: window.appSchema?.field_schema || {}
        }));

        try {
            const response = await fetch('/api/convert-server-path', { method: 'POST', body: formData });
            const data = await response.json();
            if (data.status === "pending") {
                await pollDocumentStatus(data.document_id, filename, praticaName);
            }
        } catch (err) {
            showToast(`Errore analizzando ${filename}`, true);
        }
    }

    function showToast(message, isError = false) {
        const toastEl = document.getElementById('toast');
        if (!toastEl) {
            console.log("Toast [missing]:", message);
            return;
        }
        toastEl.textContent = message;
        toastEl.style.borderLeftColor = isError ? 'var(--color-coral)' : 'var(--color-sage)';
        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 3000);
    }

    async function pollDocumentStatus(docId, filename, praticaName) {
        let completed = false;
        while (!completed) {
            try {
                const res = await fetch(`/api/documents/${docId}`);
                const data = await res.json();
                
                if (data.status === "completed") {
                    completed = true;
                    // Find if file is split or original
                    window.globalBatchData.push({
                        file: { name: filename },
                        extracted: data.extracted_data,
                        docId: docId
                    });
                    updateHistory(filename, data.label || "UNKNOWN");
                    renderMasterMatrix(praticaName);
                } else if (data.status === "failed") {
                    completed = true;
                    showToast(`Analisi fallita: ${filename}`, true);
                } else {
                    // Processing or pending
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (err) {
                console.error("Polling error:", err);
                break;
            }
        }
    }

    async function uploadAndProcessFile(file, praticaName = null) {
        console.log(`Avvio uploadAndProcessFile per: ${file.name}`);
        
        try {
            console.log("Semplificazione dati...");
            const formData = new FormData();
            formData.append('file', file);
            if (praticaName) formData.append('pratica', praticaName);
            
            const aiContext = document.getElementById('ai-context-input')?.value || "";
            formData.append('ai_context', aiContext);
            
            const extractionSchema = JSON.stringify({ 
                taxonomy: window.appSchema?.taxonomy || {},
                expected_fields_per_type: window.appSchema?.field_schema || {}
            });
            formData.append('schema', extractionSchema);

            console.log("Inviando fetch con timeout di 60s...");
            showToast(`🚀 Fase 1: Invio ${file.name}...`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const response = await fetch('/api/convert', { 
                method: 'POST', 
                body: formData,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            console.log("Ricevuta risposta:", response.status);
            showToast(`✅ Fase 2: Server connesso (${response.status})`);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: "Errore Sconosciuto" }));
                throw new Error(errorData.detail || "Errore Server");
            }
            
            const data = await response.json();
            if (data.status === "pending") {
                showToast(`⏳ Fase 3: Elaborazione in corso...`);
                await pollDocumentStatus(data.document_id, file.name, praticaName);
            }
        } catch (err) {
            console.error("ERRORE CRITICO:", err);
            alert("ERRORE DI CONNESSIONE: " + err.message);
            showToast(`❌ ERRORE: ${err.message}`, true);
        }
    }
    
    window.currentSort = { key: null, type: null, asc: true };
    window.collapsedColumns = new Set();

    window.toggleColumn = function(index, praticaName) {
        if (window.collapsedColumns.has(index)) {
            window.collapsedColumns.delete(index);
        } else {
            window.collapsedColumns.add(index);
        }
        renderMasterMatrix(praticaName);
    };

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
            } else if (type === 'extra') {
                valA = a.extracted.spontaneous_fields?.[key] || '';
                valB = b.extracted.spontaneous_fields?.[key] || '';
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

    function renderMasterMatrix(praticaName) {
        window._lastPraticaName = praticaName;
        const container = document.getElementById('master-matrix-container');
        const emptyState = document.getElementById('empty-state');
        if (window.globalBatchData.length === 0) return;
        
        if(emptyState) emptyState.style.display = 'none';

        // 1. Calculate Intersection Matrix mapping distinct keys across document typologies.
        const allFieldKeys = new Set();
        const allExtraKeys = new Set();
        window.globalBatchData.forEach(item => {
            const fields = item.extracted.fields || {};
            const extras = item.extracted.spontaneous_fields || {};
            Object.keys(fields).forEach(k => allFieldKeys.add(k));
            Object.keys(extras).forEach(k => allExtraKeys.add(k));
        });
        
        const fieldKeyArray = Array.from(allFieldKeys);
        const extraKeyArray = Array.from(allExtraKeys);

        const injectTitle = document.getElementById('matrix-title-inject');
        if (injectTitle) {
            if (praticaName) {
                injectTitle.textContent = `Dossier: ${praticaName}`;
                injectTitle.style.display = 'inline-block';
            } else {
                injectTitle.style.display = 'none';
            }
        }
        const exBtn = document.getElementById('export-excel-btn');
        if(exBtn) exBtn.style.display = 'flex';
        const cmBtn = document.getElementById('col-manager-btn');
        if(cmBtn) cmBtn.style.display = 'flex';

        // Prepare the Column Manager list once we have all keys
        renderColumnOptions(fieldKeyArray, extraKeyArray);

        let html = `<button class="exit-fullscreen-btn" onclick="document.getElementById('master-matrix-container').classList.remove('master-matrix-container-fullscreen')">✖ Esci da Pieno Schermo</button>`;
        html += `<table class="excel-table master-excel-table" style="box-shadow: 0 4px 6px rgba(166,139,99,0.08);">
            <thead>
                <tr>
                    <th class="sticky-col col-file ${window.collapsedColumns.has(0) ? 'col-hidden' : ''}" onclick="sortTable('file', 'name')" style="background-color: var(--color-sage); color: white; cursor: pointer;">
                        <div class="th-content-wrapper">
                            File ${window.getSortIcon('file','name')}
                        </div>
                    </th>
                    <th class="sticky-col col-cat ${window.collapsedColumns.has(1) ? 'col-hidden' : ''}" onclick="sortTable('meta', 'category')" style="background-color: var(--color-sage); color: white; cursor: pointer;">
                        <div class="th-content-wrapper">
                            Categoria ${window.getSortIcon('meta','category')}
                        </div>
                    </th>
                    <th class="sticky-col col-sub ${window.collapsedColumns.has(2) ? 'col-hidden' : ''}" onclick="sortTable('meta', 'label')" style="background-color: var(--color-sage); color: white; cursor: pointer;">
                        <div class="th-content-wrapper">
                            Sottocategoria ${window.getSortIcon('meta','label')}
                        </div>
                    </th>
                    <th class="col-date ${window.collapsedColumns.has(3) ? 'col-hidden' : ''}" onclick="sortTable('meta', 'data_documento')" style="background-color: var(--color-sage); color: white; cursor: pointer; width: 110px; min-width: 110px;">
                        <div class="th-content-wrapper">
                            Data Atto ${window.getSortIcon('meta','data_documento')}
                        </div>
                    </th>
                    <th style="background-color: var(--color-tan); color: white; text-align: center; width: 150px; min-width: 150px;">Dati Completi</th>`;
        
        html += `</tr></thead><tbody>`;

        window.globalBatchData.forEach((item, index) => {
            const ext = item.extracted || {};
            const meta = ext.metadata || {};
            const fields = ext.fields || {};
            const extras = ext.spontaneous_fields || {};
            
            // Get filename securely
            const fileName = (item.file && typeof item.file === 'object' && item.file.name) ? item.file.name : (typeof item.file === 'string' ? item.file : '-');

            html += `<tr>
                <td class="sticky-col col-file ${window.collapsedColumns.has(0) ? 'col-hidden' : ''}" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <a href="#" onclick="openPDFModal(${index}); return false;" style="color: var(--color-olive); text-decoration: underline; font-weight: 600;">${fileName}</a>
                </td>
                <td class="sticky-col col-cat ${window.collapsedColumns.has(1) ? 'col-hidden' : ''}">${meta.category || '-'}</td>
                <td class="sticky-col col-sub ${window.collapsedColumns.has(2) ? 'col-hidden' : ''}" style="color: var(--color-sage); font-weight: 500;">${meta.label || '-'}</td>
                <td class="col-date ${window.collapsedColumns.has(3) ? 'col-hidden' : ''}">${meta.data_documento || '-'}</td>
                <td style="text-align: center;">
                    <a href="pratica.html?name=${encodeURIComponent(praticaName)}" class="btn-full-data" style="display:inline-block; background: var(--color-olive); color: white; text-decoration: none; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">Visiona dati completi</a>
                </td>`;
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    function getCellDisplayInfo(entry, val, colIdx) {
        const formatNested = (data) => {
            if (data === null || data === undefined || data === "") return '-';
            
            // If already a string, return it
            if (typeof data === 'string') return data;
            
            // Handle Arrays
            if (Array.isArray(data)) {
                if (data.length === 0) return '-';
                return '<div style="display:flex; flex-direction:column; gap:0.4rem;">' + data.map((item) => {
                    const content = (item && typeof item === 'object') ? JSON.stringify(item) : String(item);
                    return `<div style="padding:4px; border-left:2px solid var(--color-tan); background:rgba(126,106,86,0.03);">${content}</div>`;
                }).join('') + '</div>';
            }

            // If it's an object, check if it's empty
            if (typeof data === 'object') {
                if (Object.keys(data).length === 0) return '-';
                
                // Format plain objects nicely
                return Object.entries(data).map(([key, value]) => {
                    const displayVal = (value && typeof value === 'object') ? JSON.stringify(value) : String(value);
                    return `<div style="font-size:0.75rem;"><strong style="color:var(--color-olive);">${key}:</strong> ${displayVal}</div>`;
                }).join('');
            }
            
            return String(data);
        };

        let cellContent = (typeof val === 'object' && val !== null) ? formatNested(val) : (val === null || val === undefined || val === "" ? '-' : val);
        let indicator = "";
        let style = "";
        
        if (typeof entry === 'object' && entry !== null && 'confidence' in entry) {
            const conf = entry.confidence;
            if (conf < 60) {
                style = "background: rgba(255,107,107,0.1); color: #d63031;";
                indicator = `<span title="Confidenza Bassa: ${conf}%" style="font-size: 0.8rem; margin-left: 4px; cursor: help;">⚠️</span>`;
            } else if (conf < 90) {
                style = "background: rgba(243,156,18,0.1);";
                indicator = `<span title="Confidenza Media: ${conf}%" style="font-size: 0.8rem; margin-left: 4px; opacity: 0.7;">🟡</span>`;
            }
        }
        return { cellContent, style, indicator };
    }

    /* --- Column Management Logic --- */
    window.toggleColumnManager = function() {
        const dropdown = document.getElementById('col-manager-dropdown');
        if(dropdown) dropdown.classList.toggle('show');
    };

    // Close manager when clicking outside
    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('col-manager-wrapper');
        const dropdown = document.getElementById('col-manager-dropdown');
        if (wrap && !wrap.contains(e.target)) {
            dropdown?.classList.remove('show');
        }
    });

    function renderColumnOptions(fields, extras) {
        const list = document.getElementById('col-options-list');
        if (!list) return;

        let optionsHtml = '';
        const standardCols = ["File", "Categoria", "Sottocategoria", "Data Atto", "Prot."];
        
        standardCols.forEach((name, i) => {
            optionsHtml += createOptionRow(name, i, 'meta');
        });

        fields.forEach((name, i) => {
            optionsHtml += createOptionRow(name, i + 5, 'field');
        });

        extras.forEach((name, i) => {
            optionsHtml += createOptionRow(name, i + 5 + fields.length, 'extra');
        });

        list.innerHTML = optionsHtml;
    }

    function createOptionRow(name, index, type) {
        const isHidden = window.collapsedColumns.has(index);
        const color = type === 'meta' ? 'var(--color-sage)' : (type === 'field' ? 'var(--color-tan)' : '#5DADE2');
        const label = name.charAt(0).toUpperCase() + name.slice(1);
        
        return `
            <label class="column-option" style="border-left: 4px solid ${color};">
                <input type="checkbox" ${!isHidden ? 'checked' : ''} onchange="window.toggleColumnVisibility(${index}, this.checked)">
                <span>${label}</span>
            </label>
        `;
    }

    window.toggleColumnVisibility = function(index, isVisible) {
        if (!isVisible) {
            window.collapsedColumns.add(index);
        } else {
            window.collapsedColumns.delete(index);
        }
        renderMasterMatrix(window._lastPraticaName);
    };

    window.openPDFModal = function(index) {
        const item = window.globalBatchData[index];
        const modal = document.getElementById('pdf-modal');
        const title = document.getElementById('modal-title');
        const grid = document.getElementById('pdf-grid-container');
        const view = document.getElementById('pdf-view-container');
        const ctrls = document.getElementById('split-controls-bar');
        
        if (ctrls) ctrls.style.display = 'none';
        grid.style.display = 'none';
        view.style.display = 'block';

        if(!item) return;

        title.textContent = `Visualizzatore Documento: ${item.file.name}`;
        modal.classList.add('show');

        const id = item.docId || item.id || item.doc_id;
        const fileUrl = id ? `/api/documents/${id}/pdf` : (item.file instanceof File ? URL.createObjectURL(item.file) : "");
        view.innerHTML = `<iframe src="${fileUrl}" width="100%" height="100%" style="border:none; border-radius:var(--radius-md);"></iframe>`;
    };

    window.closePDFModal = function() {
        const modal = document.getElementById('pdf-modal');
        const view = document.getElementById('pdf-view-container');
        const grid = document.getElementById('pdf-grid-container');
        const splitBar = document.getElementById('split-controls-bar');
        const content = modal.querySelector('.modal-content');
        
        modal.classList.remove('show');
        if (content) content.classList.remove('wide');
        if (view) view.innerHTML = '';
        if (grid) grid.innerHTML = '';
        if (splitBar) splitBar.style.display = 'none';
        
        document.body.style.overflow = 'auto';
        
        // Reset modal title to default for normal viewing
        const title = document.getElementById('modal-title');
        title.textContent = "Visualizzatore Documenti";
    };

    window.exportToCSV = async function() {
        if (window.globalBatchData.length === 0) return;

        showToast("📦 Generazione Excel (.xlsx) in corso...");

        const allFieldKeys = new Set();
        const allExtraKeys = new Set();
        window.globalBatchData.forEach(item => {
            const fields = item.extracted.fields || {};
            const extras = item.extracted.spontaneous_fields || {};
            Object.keys(fields).forEach(k => allFieldKeys.add(k));
            Object.keys(extras).forEach(k => allExtraKeys.add(k));
        });
        const fieldKeyArray = Array.from(allFieldKeys);
        const extraKeyArray = Array.from(allExtraKeys);

        // Prepara Configurazione Intestazioni per il Backend
        const headers = [
            { text: "Nome File", type: "meta" },
            { text: "Categoria", type: "meta" },
            { text: "Sottocategoria", type: "meta" },
            { text: "Data Atto", type: "meta" },
            { text: "Data Protocollo", type: "meta" }
        ];
        fieldKeyArray.forEach(k => headers.push({ text: k.charAt(0).toUpperCase() + k.slice(1), type: "field" }));
        extraKeyArray.forEach(k => headers.push({ text: k.charAt(0).toUpperCase() + k.slice(1), type: "extra" }));

        // Prepara Righe
        const rows = window.globalBatchData.map(item => {
            const meta = item.extracted.metadata || {};
            const fields = item.extracted.fields || {};
            const extras = item.extracted.spontaneous_fields || {};
            
            const row = [
                item.file.name,
                meta.category || '',
                meta.label || '',
                meta.data_documento || '',
                meta.data_protocollo || ''
            ];
            
            fieldKeyArray.forEach(k => {
                const entry = fields[k] || "";
                row.push((typeof entry === 'object' && entry !== null && 'value' in entry) ? entry.value : entry);
            });
            
            extraKeyArray.forEach(k => {
                const entry = extras[k] || "";
                row.push((typeof entry === 'object' && entry !== null && 'value' in entry) ? entry.value : entry);
            });
            
            return row;
        });

        try {
            const response = await fetch('/api/export-excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: `Estrazione_${new Date().toISOString().slice(0,10)}.xlsx`,
                    headers: headers,
                    rows: rows
                })
            });

            if (!response.ok) throw new Error("Errore durante la generazione dell'Excel");

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Estrazione_${new Date().toISOString().slice(0,10)}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast("✅ Excel scaricato correttamente!");
        } catch (err) {
            console.error("Export Error:", err);
            showToast("❌ Errore durante l'export Excel", true);
        }
    };

    function updateHistory(filename, label) {
        const list = document.getElementById('history-list');
        const emptyState = document.querySelector('.history-empty');
        if (emptyState) emptyState.remove();

        const li = document.createElement('li');
        li.style.padding = '10px';
        li.style.marginBottom = '8px';
        li.style.backgroundColor = 'rgba(166, 139, 99, 0.08)';
        li.style.borderRadius = '8px';
        li.style.cursor = 'pointer';
        li.style.fontSize = '0.85rem';
        li.style.borderLeft = '3px solid var(--color-mustard)';
        
        li.innerHTML = `<strong>${filename}</strong> <br/> <span style="color: var(--text-muted)">${label}</span>`;
        list.prepend(li);
    }

    // --- Taxonomy Tree Implementation ---
    window.appSchema = null;
    
    fetch('/api/schema')
        .then(res => res.json())
        .then(data => {
            window.appSchema = data;
            renderSchemaTree(data);
        })
        .catch(err => {
            const tree = document.getElementById('schema-tree');
            if(tree) tree.innerHTML = `<p style="color:var(--color-coral); text-align:center;">Caricamento schema fallito: ${err.message}</p>`;
        });

    let openStates = {};

    function renderSchemaTree(data) {
        const tree = document.getElementById('schema-tree');
        if(!tree || !data.taxonomy) return;
        tree.innerHTML = '';
        
        Object.entries(data.taxonomy).forEach(([category, labels]) => {
            const catDetails = document.createElement('details');
            catDetails.style.marginBottom = '1.25rem';
            
            // Retain category open state
            if (openStates[category]) catDetails.open = true;
            catDetails.addEventListener('toggle', () => { openStates[category] = catDetails.open; });

            const catSummary = document.createElement('summary');
            catSummary.style.fontWeight = '600';
            catSummary.style.color = 'var(--text-main)';
            catSummary.style.fontSize = '0.85rem';
            catSummary.style.textTransform = 'none'; /* Softened from uppercase */
            catSummary.style.borderBottom = '1px solid rgba(166, 139, 99, 0.2)';
            catSummary.style.paddingBottom = '0.2rem';
            catSummary.style.marginBottom = '0.4rem';
            catSummary.style.cursor = 'pointer';
            catSummary.style.listStyle = 'none'; // Basic cleanup
            catSummary.textContent = `▶ ${category}`;
            
            catDetails.appendChild(catSummary);
            
            catDetails.addEventListener('toggle', () => {
                catSummary.textContent = catDetails.open ? `▼ ${category}` : `▶ ${category}`;
            });
            // Init arrow
            catSummary.textContent = catDetails.open ? `▼ ${category}` : `▶ ${category}`;

            labels.forEach(label => {
                const details = document.createElement('details');
                details.style.marginBottom = '0.5rem';
                details.style.marginLeft = '1rem';
                
                // Retain label state
                if (openStates[label]) details.open = true;
                details.addEventListener('toggle', () => { openStates[label] = details.open; });
                
                const summary = document.createElement('summary');
                summary.style.cursor = 'pointer';
                summary.style.fontWeight = '500';
                summary.style.fontSize = '0.85rem';
                summary.style.color = 'var(--text-main)';
                summary.style.outline = 'none';
                summary.textContent = label;
                details.appendChild(summary);
                
                const fieldsList = document.createElement('ul');
                fieldsList.style.listStyle = 'none';
                fieldsList.style.paddingLeft = '1.5rem';
                fieldsList.style.marginTop = '0.5rem';
                fieldsList.style.borderLeft = '1px dashed var(--border-color)';
                
                const fields = data.field_schema[label] || [];
                fields.forEach((field, index) => {
                    const li = document.createElement('li');
                    li.style.fontSize = '0.8rem';
                    li.style.color = 'var(--text-muted)';
                    li.style.marginBottom = '0.25rem';
                    li.style.display = 'flex';
                    li.style.justifyContent = 'space-between';
                    li.style.alignItems = 'center';
                    li.style.padding = '0.2rem 0.5rem';
                    li.style.backgroundColor = 'rgba(126, 106, 86, 0.03)';
                    li.style.borderRadius = '4px';
                    
                    const span = document.createElement('span');
                    span.textContent = `• ${field}`;
                    li.appendChild(span);
                    
                    const delBtn = document.createElement('span');
                    delBtn.innerHTML = '&times;';
                    delBtn.style.cursor = 'pointer';
                    delBtn.style.color = 'var(--color-coral)';
                    delBtn.style.fontSize = '0.9rem';
                    delBtn.style.fontWeight = 'bold';
                    delBtn.title = "Delete field";
                    delBtn.onclick = () => {
                        data.field_schema[label].splice(index, 1);
                        renderSchemaTree(data);
                    };
                    li.appendChild(delBtn);
                    
                    fieldsList.appendChild(li);
                });
                
                // Add Field Logic
                const addTarget = document.createElement('li');
                addTarget.style.marginTop = '0.5rem';
                addTarget.style.display = 'flex';
                addTarget.style.gap = '0.25rem';
                
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = 'Aggiungi campo schema...';
                input.style.fontSize = '0.75rem';
                input.style.padding = '0.25rem 0.5rem';
                input.style.border = '1px solid var(--border-color)';
                input.style.borderRadius = '4px';
                input.style.flex = '1';
                input.style.outline = 'none';
                
                const addBtn = document.createElement('button');
                addBtn.textContent = '+';
                addBtn.style.background = 'var(--color-sage)';
                addBtn.style.color = 'white';
                addBtn.style.border = 'none';
                addBtn.style.borderRadius = '4px';
                addBtn.style.padding = '0 0.5rem';
                addBtn.style.cursor = 'pointer';
                addBtn.type = 'button';
                
                const handleAdd = () => {
                    if (input.value.trim()) {
                        if (!data.field_schema[label]) data.field_schema[label] = [];
                        if (!data.field_schema[label].includes(input.value.trim())) {
                            data.field_schema[label].push(input.value.trim());
                            renderSchemaTree(data);
                        }
                    }
                };
                addBtn.onclick = handleAdd;
                input.onkeypress = (e) => { if(e.key === 'Enter') { e.preventDefault(); handleAdd(); } };
                
                addTarget.appendChild(input);
                addTarget.appendChild(addBtn);
                fieldsList.appendChild(addTarget);
                
                details.appendChild(fieldsList);
                catDetails.appendChild(details);
            });
            
            tree.appendChild(catDetails);
        });
    }
});

// --- SETTINGS CONTROLS ---

window.openSettingsModal = async function() {
    const modal = document.getElementById('settings-modal');
    const input = document.getElementById('api-key-input');
    const statusText = document.getElementById('api-key-status');
    
    input.value = '';
    statusText.textContent = 'Caricamento stato...';
    modal.classList.add('show');
    
    try {
        const response = await fetch('/api/settings/apikey');
        if (response.ok) {
            const data = await response.json();
            if (data.has_key) {
                statusText.textContent = `Chiave attiva rilevata: ${data.masked_key}. Puoi sovrascriverla inserendone una nuova.`;
            } else {
                statusText.textContent = 'Nessuna chiave API trovata. Il sistema non può estrarre dati.';
                statusText.style.color = 'var(--color-coral)';
            }
        }
    } catch (e) {
        statusText.textContent = 'Errore di connessione al server.';
    }
};

window.closeSettingsModal = function() {
    document.getElementById('settings-modal').classList.remove('show');
};

window.saveApiKey = async function() {
    const input = document.getElementById('api-key-input');
    const statusText = document.getElementById('api-key-status');
    const keyStr = input.value.trim();
    
    if (!keyStr) {
        statusText.textContent = "Errore: Inserisci una chiave valida.";
        statusText.style.color = "var(--color-coral)";
        return;
    }
    
    statusText.textContent = "Salvataggio...";
    statusText.style.color = "var(--color-sage)";
    
    try {
        const response = await fetch('http://localhost:8000/api/settings/apikey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: keyStr })
        });
        if (response.ok) {
            statusText.textContent = "Chiave API salvata e attiva! Tutte le nuove estrazioni useranno questa chiave.";
            input.value = '';
            setTimeout(window.closeSettingsModal, 2000);
        } else {
            throw new Error("Salvataggio fallito");
        }
    } catch (e) {
        statusText.textContent = "Errore durante il salvataggio.";
        statusText.style.color = "var(--color-coral)";
    }
};


window.toggleSidebarSection = (sectionId) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.classList.toggle('collapsed');
};

window.openPraticaSelectionModal = function() {
    return new Promise(async (resolve) => {
        const modal = document.getElementById('pratica-selection-modal');
        const select = document.getElementById('existing-pratica-select');
        const input = document.getElementById('new-pratica-input');
        const confirmBtn = document.getElementById('confirm-pratica-btn');
        
        // Fetch existing
        try {
            const res = await fetch('/api/pratiche');
            const data = await res.json();
            const list = data.pratiche || [];
            select.innerHTML = '<option value="">-- Seleziona esistente --</option>' + 
                list.map(p => `<option value="${p}">${p}</option>`).join('');
        } catch (e) { console.error(e); }

        input.value = "";
        modal.classList.add('show');

        // Close on escape or click outside
        const handleConfirm = () => {
            const newTitle = input.value.trim();
            const existingTitle = select.value;
            const finalTitle = newTitle || existingTitle;

            if (!finalTitle) {
                alert("Seleziona una pratica o inserisci un nuovo nome.");
                return;
            }
            
            cleanup();
            resolve(finalTitle);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            confirmBtn.onclick = null;
            modal.classList.remove('show');
        };

        confirmBtn.onclick = handleConfirm;
        window.closePraticaModal = handleCancel;
    });
};
