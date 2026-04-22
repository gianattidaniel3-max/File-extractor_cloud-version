document.addEventListener("DOMContentLoaded", async () => {
    const searchInput = document.getElementById('archive-search-input');
    
    // Initial load
    loadPratiche();

    // Search event
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = e.target.value.trim();
            if (query.length > 0) {
                searchPratiche(query);
            } else {
                loadPratiche();
            }
        }, 300);
    });
});

async function loadPratiche() {
    try {
        const response = await fetch('/api/pratiche');
        if (!response.ok) throw new Error("Errore caricamento pratiche.");
        const data = await response.json();
        renderPratiche(data.pratiche);
    } catch (err) {
        document.getElementById('loading').innerHTML = `<p style="color: var(--color-coral);">${err.message}</p>`;
    }
}

async function searchPratiche(q) {
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const results = await response.json();
        
        // Group search results by pratica_name for display
        const praticheNames = [...new Set(results.map(r => r.pratica_name))];
        renderPratiche(praticheNames);
    } catch (err) {
        console.error("Search error:", err);
    }
}

function renderPratiche(pratiche) {
    const container = document.getElementById('dossiers-container');
    const loadingElem = document.getElementById('loading');
    if(loadingElem) loadingElem.style.display = 'none';

    container.innerHTML = '';
    
    if (!pratiche || pratiche.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align:center;">Nessuna Pratica trovata.</p>`;
        return;
    }
    
    pratiche.forEach(pratica => {
        if(!pratica) return;
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'dossier-card-wrapper';

        const a = document.createElement('a');
        a.className = 'dossier-card';
        a.href = `pratica.html?name=${encodeURIComponent(pratica)}`;
        a.innerHTML = `<h3>${pratica}</h3><span>Visualizza Dati</span>`;
        
        // Card Actions
        const actions = document.createElement('div');
        actions.className = 'card-actions';
        
        const btnAnalyze = document.createElement('button');
        btnAnalyze.className = 'action-btn btn-brain focus-ring';
        btnAnalyze.textContent = 'Estrazione Incrociata';
        btnAnalyze.onclick = (e) => {
            e.preventDefault();
            openAnalysisModal(pratica);
        };
        
        actions.appendChild(btnAnalyze);

        const delBtn = document.createElement('button');
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Elimina Pratica';
        delBtn.className = 'delete-pratica-btn';
        delBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            deletePratica(pratica, cardWrapper);
        };

        cardWrapper.appendChild(a);
        cardWrapper.appendChild(actions);
        cardWrapper.appendChild(delBtn);
        container.appendChild(cardWrapper);
    });
}

// --- CROSS ANALYSIS LOGIC ---
let currentPraticaForAnalysis = null;

async function openAnalysisModal(name) {
    currentPraticaForAnalysis = name;
    const modal = document.getElementById('analysis-modal');
    const title = document.getElementById('analysis-modal-title');
    const subtitle = document.getElementById('analysis-modal-subtitle');
    const resultContainer = document.getElementById('analysis-result-container');
    const builderContainer = document.getElementById('rules-builder-container');
    
    title.textContent = `Estrazione Incrociata: ${name}`;
    subtitle.textContent = "Analisi in corso...";
    resultContainer.style.display = 'none';
    
    // Reset builder
    builderContainer.innerHTML = '';
    addRuleRow(); // Start with one empty row
    
    modal.classList.add('show');
    
    loadAnalysisHistory(name);
    loadPresets();
}

window.closeAnalysisModal = () => {
    document.getElementById('analysis-modal').classList.remove('show');
    currentPraticaForAnalysis = null;
};

// --- DYNAMIC BUILDER LOGIC ---
window.addRuleRow = (nameVal = "", logicVal = "") => {
    const container = document.getElementById('rules-builder-container');
    const row = document.createElement('div');
    row.className = 'rules-builder-row';
    row.innerHTML = `
        <input type="text" class="rule-name-input" placeholder="E.g. Debitore" value="${nameVal}">
        <textarea class="rule-logic-input" placeholder="E.g. Identifica il debitore principale nel contratto..." rows="2">${logicVal}</textarea>
        <button class="remove-rule-btn" onclick="this.parentElement.remove()">🗑️</button>
    `;
    container.appendChild(row);
};

// --- PRESETS LOGIC ---
let globalPresets = [];

async function loadPresets() {
    const selector = document.getElementById('preset-selector');
    selector.innerHTML = '<option value="">( Seleziona Modello )</option>';
    
    try {
        const res = await fetch('/api/presets');
        globalPresets = await res.json();
        
        globalPresets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            selector.appendChild(opt);
        });
    } catch (err) {
        console.error("Errore caricamento modelli:", err);
    }
}

window.loadSelectedPreset = () => {
    const id = document.getElementById('preset-selector').value;
    if (!id) return;
    
    const preset = globalPresets.find(p => p.id == id);
    if (!preset) return;
    
    const container = document.getElementById('rules-builder-container');
    container.innerHTML = '';
    
    preset.rules_json.forEach(r => {
        addRuleRow(r.name, r.logic);
    });
};

window.saveCurrentAsPreset = async () => {
    const name = prompt("Nome per questo Modello di Analisi:");
    if (!name) return;
    
    const rows = Array.from(document.querySelectorAll('.rules-builder-row'));
    const rules = rows.map(row => ({
        name: row.querySelector('.rule-name-input').value.trim(),
        logic: row.querySelector('.rule-logic-input').value.trim()
    })).filter(r => r.name || r.logic);
    
    if (rules.length === 0) return alert("Aggiungi almeno una regola.");
    
    try {
        const res = await fetch('/api/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, rules })
        });
        
        if (res.ok) {
            alert("Modello salvato con successo.");
            loadPresets();
        }
    } catch (err) {
        alert("Errore salvataggio modello.");
    }
};

// --- HISTORY & RESULTS ---
async function loadAnalysisHistory(name) {
    const list = document.getElementById('analysis-history-list');
    list.innerHTML = '<p style="font-size:0.8rem; color:var(--color-tan);">Caricamento...</p>';
    
    try {
        const res = await fetch(`/api/pratica/${encodeURIComponent(name)}/cross-analyses`);
        const data = await res.json();
        
        if (data.length === 0) {
            list.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted); font-style:italic;">Nessuna analisi precedente trovata.</p>';
            return;
        }
        
        list.innerHTML = data.map(r => `
            <div class="history-item" onclick="showPastAnalysis(${JSON.stringify(r.id)})">
                <div style="font-size:0.8rem; font-weight:700; color:var(--color-olive); margin-bottom:0.25rem;">${new Date(r.created_at).toLocaleString()}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Analisi: ${r.rules.substring(0, 50)}...</div>
            </div>
        `).join('');
        
        window.pastAnalyses = data;
        document.getElementById('analysis-modal-subtitle').textContent = `${data.length} analisi in archivio`;
    } catch (err) {
        list.innerHTML = '<p style="color:red; font-size:0.8rem;">Errore nel caricamento.</p>';
    }
}

window.showPastAnalysis = (id) => {
    const analysis = window.pastAnalyses.find(a => a.id === id);
    if (!analysis) return;
    
    const container = document.getElementById('analysis-result-container');
    const mdArea = document.getElementById('analysis-result-md');
    const dlBtn = document.getElementById('download-word-btn');
    
    container.style.display = 'block';
    mdArea.innerHTML = marked.parse(analysis.result);
    dlBtn.onclick = () => downloadWordReport(id);
};

window.downloadWordReport = (id) => {
    window.location.href = `/api/analysis/${id}/export-word`;
};

document.getElementById('run-analysis-btn').onclick = async () => {
    const rows = Array.from(document.querySelectorAll('.rules-builder-row'));
    const rulesList = rows.map(row => ({
        name: row.querySelector('.rule-name-input').value.trim(),
        logic: row.querySelector('.rule-logic-input').value.trim()
    })).filter(r => r.name || r.logic);
    
    if (rulesList.length === 0) return alert("Configura almeno un punto di analisi.");
    
    // Convert to a structured prompt for AI
    const rulesPrompt = "ANALISI PUNTUALE RICHIESTA:\n" + rulesList.map((r, i) => 
        `${i+1}. PUNTO: ${r.name}\n   LOGICA: ${r.logic}`
    ).join("\n\n");
    
    const btn = document.getElementById('run-analysis-btn');
    const container = document.getElementById('analysis-result-container');
    const mdArea = document.getElementById('analysis-result-md');
    
    btn.disabled = true;
    btn.textContent = "Analisi in corso (AI sta sintetizzando i dati)...";
    btn.style.opacity = "0.7";
    
    try {
        const formData = new FormData();
        formData.append('rules', rulesPrompt);
        
        const response = await fetch(`/api/pratica/${encodeURIComponent(currentPraticaForAnalysis)}/cross-analyze`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error("Errore durante l'analisi.");
        
        const data = await response.json();
        
        container.style.display = 'block';
        mdArea.innerHTML = marked.parse(data.result);
        document.getElementById('download-word-btn').onclick = () => downloadWordReport(data.id);
        loadAnalysisHistory(currentPraticaForAnalysis);
        
    } catch (err) {
        alert("Errore AI: " + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Avvia Estrazione Incrociata";
        btn.style.opacity = "1";
    }
};

window.copyAnalysis = () => {
    const text = document.getElementById('analysis-result-md').innerText;
    navigator.clipboard.writeText(text).then(() => alert("Copiato!"));
};

async function deletePratica(name, element) {
    if (!confirm(`Sei sicuro di voler eliminare definitivamente la pratica "${name}" e tutti i suoi documenti?`)) return;
    
    try {
        const response = await fetch(`/api/pratica/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error("Errore durante l'eliminazione.");
        
        element.style.opacity = '0';
        setTimeout(() => element.remove(), 300);
    } catch (err) {
        alert(err.message);
    }
}
