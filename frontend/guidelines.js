document.addEventListener('DOMContentLoaded', async () => {
    const listDiv = document.getElementById('definitions-list');
    const saveBtn = document.getElementById('save-btn');
    const toast = document.getElementById('toast');
    
    let schema = {};
    let descriptions = {};

    try {
        const schemaRes = await fetch('/api/schema');
        schema = await schemaRes.json();
        
        const descRes = await fetch('/api/descriptions');
        descriptions = await descRes.json();
        
        renderList();
    } catch (e) {
        listDiv.innerHTML = `<p style="color: var(--color-coral); text-align: center;">Failed to load data: ${e.message}</p>`;
    }

    function showToast(message, isError = false) {
        toast.textContent = message;
        toast.style.borderLeftColor = isError ? 'var(--color-coral)' : 'var(--color-sage)';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function renderList() {
        listDiv.innerHTML = '';
        Object.entries(schema.taxonomy).forEach(([category, labels]) => {
            const catContainer = document.createElement('div');
            catContainer.style.marginBottom = '2rem';
            
            const catTitle = document.createElement('h4');
            catTitle.textContent = category.toUpperCase();
            catTitle.style.color = 'var(--text-main)';
            catTitle.style.borderBottom = '2px solid rgba(166, 139, 99, 0.2)';
            catTitle.style.paddingBottom = '0.5rem';
            catTitle.style.marginBottom = '1.5rem';
            catTitle.style.fontSize = '1.1rem';
            catContainer.appendChild(catTitle);
            
            labels.forEach(label => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.gap = '1.5rem';
                row.style.marginBottom = '1.25rem';
                row.style.alignItems = 'flex-start';
                
                const labelTitle = document.createElement('strong');
                labelTitle.textContent = `📄 ${label}`;
                labelTitle.style.width = '240px';
                labelTitle.style.fontSize = '0.9rem';
                labelTitle.style.color = 'var(--color-olive)';
                labelTitle.style.flexShrink = '0';
                labelTitle.style.paddingTop = '0.5rem';
                
                const textarea = document.createElement('textarea');
                textarea.value = descriptions[label] || "";
                textarea.placeholder = `Provide specific LLM framing/rules for ${label}...`;
                textarea.style.flex = '1';
                textarea.style.borderRadius = '8px';
                textarea.style.padding = '0.75rem';
                textarea.style.border = '1px solid var(--color-tan)';
                textarea.style.backgroundColor = 'rgba(166, 139, 99, 0.05)';
                textarea.style.fontSize = '0.85rem';
                textarea.style.color = 'var(--text-muted)';
                textarea.style.fontFamily = 'inherit';
                textarea.rows = 2;
                textarea.style.resize = 'vertical';
                
                textarea.addEventListener('input', (e) => {
                    descriptions[label] = e.target.value;
                });
                
                row.appendChild(labelTitle);
                row.appendChild(textarea);
                catContainer.appendChild(row);
            });
            listDiv.appendChild(catContainer);
        });
    }

    saveBtn.addEventListener('click', async () => {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Synchronizing...';
        
        try {
            const res = await fetch('http://localhost:8000/api/descriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(descriptions)
            });
            if(res.ok) {
                showToast("Global Semantic Definitions Successfully Saved!");
            } else {
                showToast("Backend rejection. See console.", true);
            }
        } catch(e) {
            showToast("Network Error: " + e.message, true);
        } finally {
            saveBtn.textContent = originalText;
        }
    });
});
