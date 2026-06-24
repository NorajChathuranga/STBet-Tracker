document.addEventListener('DOMContentLoaded', () => {
    const apiList = document.getElementById('apiList');
    const domList = document.getElementById('domList');
    const clearBtn = document.getElementById('clearBtn');
    
    // Switch Tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-target')).classList.add('active');
        });
    });

    // Tracking expanded states of log details to prevent collapsing on re-renders
    const expandedApiLogs = new Set();
    const expandedDomLogs = new Set();
    let lastApiJson = '';
    let lastDomJson = '';

    // Render API Logs list
    function renderApiList(apiLogs) {
        if (apiLogs.length === 0) {
            apiList.innerHTML = '<div class="empty-state">No API calls detected yet. Open a website and perform actions.</div>';
            return;
        }

        apiList.innerHTML = '';
        apiLogs.forEach((log, index) => {
            const item = document.createElement('div');
            item.className = 'log-item';
            
            const isSuccess = log.status && log.status >= 200 && log.status < 300;
            const statusClass = isSuccess ? 'success' : 'error';
            
            const formattedTime = new Date(log.timestamp).toLocaleTimeString();
            const logId = log.timestamp;
            const isExpanded = expandedApiLogs.has(logId);
            const activeClass = isExpanded ? 'active' : '';

            item.innerHTML = `
                <div class="log-header" data-log-id="${logId}">
                    <span class="method-badge ${log.method}">${log.method}</span>
                    <span class="log-url" title="${log.url}">${log.url}</span>
                    <span class="status-badge ${statusClass}">${log.status || 'ERR'}</span>
                    <span class="log-time">${formattedTime}</span>
                </div>
                <div class="log-details ${activeClass}" id="api-detail-${logId}">
                    <strong>Type:</strong> ${log.type}<br>
                    <strong>Timestamp:</strong> ${log.timestamp}<br>
                    <strong>URL:</strong> <span style="font-family:monospace; word-break:break-all;">${log.url}</span><br>
                    <strong>Request Body:</strong>
                    <pre>${log.requestBody ? JSON.stringify(log.requestBody, null, 2) : 'None'}</pre>
                    <strong>Response:</strong>
                    <pre>${log.responseBody ? JSON.stringify(log.responseBody, null, 2) : 'No payload or stream consumed'}</pre>
                </div>
            `;
            apiList.appendChild(item);
        });

        // Attach details toggle listeners for API logs
        document.querySelectorAll('#apiList .log-header').forEach(hdr => {
            hdr.addEventListener('click', () => {
                const logId = hdr.getAttribute('data-log-id');
                const detail = document.getElementById(`api-detail-${logId}`);
                if (detail) {
                    if (detail.classList.contains('active')) {
                        expandedApiLogs.delete(logId);
                        detail.classList.remove('active');
                    } else {
                        expandedApiLogs.add(logId);
                        detail.classList.add('active');
                    }
                }
            });
        });
    }

    // Render DOM Changes list
    function renderDomList(domLogs) {
        if (domLogs.length === 0) {
            domList.innerHTML = '<div class="empty-state">No layout or DOM changes tracked yet.</div>';
            return;
        }

        domList.innerHTML = '';
        domLogs.forEach((log) => {
            const item = document.createElement('div');
            item.className = 'log-item';
            const formattedTime = new Date(log.timestamp).toLocaleTimeString();
            
            const logId = log.timestamp;
            const isExpanded = expandedDomLogs.has(logId);
            const activeClass = isExpanded ? 'active' : '';

            // Generate a nice summary title
            let summaryTitle = 'DOM Change';
            const changes = log.changes || [];
            if (changes.length === 1) {
                const change = changes[0];
                if (change.type === 'TEXT') {
                    const oldVal = change.oldValue || '';
                    const newVal = change.newValue || '';
                    summaryTitle = `Text: "${oldVal.substring(0, 15)}" ➔ "${newVal.substring(0, 15)}"`;
                } else if (change.type === 'ATTRIBUTE') {
                    const selector = change.selector || '';
                    summaryTitle = `Attr: [${change.attributeName || ''}] on ${(selector.split(' > ').pop() || 'element')}`;
                } else if (change.type === 'CHILD_LIST') {
                    const addCount = (change.added || []).length;
                    const remCount = (change.removed || []).length;
                    summaryTitle = `Nodes: +${addCount} / -${remCount}`;
                }
            } else if (changes.length > 1) {
                const types = changes.map(c => c.type);
                const textCount = types.filter(t => t === 'TEXT').length;
                const attrCount = types.filter(t => t === 'ATTRIBUTE').length;
                const childCount = types.filter(t => t === 'CHILD_LIST').length;
                
                const parts = [];
                if (textCount) parts.push(`${textCount} text`);
                if (attrCount) parts.push(`${attrCount} attr`);
                if (childCount) parts.push(`${childCount} nodes`);
                summaryTitle = `${changes.length} changes (${parts.join(', ')})`;
            }
            
            // Render changes inside the toggleable details
            let changesHtml = '';
            changes.forEach(change => {
                let changeDetailHtml = '';
                if (change.type === 'TEXT') {
                    changeDetailHtml = `
                        <span class="badge text-change">Text</span>
                        <span class="dom-change-target">${change.selector}</span>
                        <div class="diff-container">
                            <div class="diff-old">Old: "${change.oldValue || '(empty)'}"</div>
                            <div class="diff-new">New: "${change.newValue || '(empty)'}"</div>
                        </div>
                    `;
                } else if (change.type === 'ATTRIBUTE') {
                    changeDetailHtml = `
                        <span class="badge attr-change">Attr: ${change.attributeName}</span>
                        <span class="dom-change-target">${change.selector}</span>
                        <div class="diff-container">
                            <div class="diff-old">Old: "${change.oldValue || '(empty)'}"</div>
                            <div class="diff-new">New: "${change.newValue || '(empty)'}"</div>
                        </div>
                    `;
                } else if (change.type === 'CHILD_LIST') {
                    const addedHtml = change.added.map(node => `<div class="diff-new">+ ${node}</div>`).join('');
                    const removedHtml = change.removed.map(node => `<div class="diff-old">- ${node}</div>`).join('');
                    changeDetailHtml = `
                        <span class="badge child-change">Nodes</span>
                        <span class="dom-change-target">${change.selector}</span>
                        <div class="diff-container">
                            ${removedHtml}
                            ${addedHtml}
                        </div>
                    `;
                }
                
                changesHtml += `
                    <div class="dom-change-item">
                        ${changeDetailHtml}
                    </div>
                `;
            });
            
            item.innerHTML = `
                <div class="log-header" data-log-id="${logId}">
                    <span class="method-badge XHR" style="background-color: rgba(16, 185, 129, 0.15); color: var(--success-color);">DOM</span>
                    <span class="log-url" title="${log.url}">${summaryTitle}</span>
                    <span class="log-time">${formattedTime}</span>
                </div>
                <div class="log-details ${activeClass}" id="dom-detail-${logId}">
                    <strong>Timestamp:</strong> ${log.timestamp}<br>
                    <strong>Page URL:</strong> <span style="font-family:monospace; word-break:break-all;">${log.url}</span><br>
                    <div style="margin-top: 10px;">
                        <strong>Changes:</strong>
                        ${changesHtml || 'No specific details recorded.'}
                    </div>
                </div>
            `;
            domList.appendChild(item);
        });

        // Attach details toggle listeners for DOM
        document.querySelectorAll('#domList .log-header').forEach(hdr => {
            hdr.addEventListener('click', () => {
                const logId = hdr.getAttribute('data-log-id');
                const detail = document.getElementById(`dom-detail-${logId}`);
                if (detail) {
                    if (detail.classList.contains('active')) {
                        expandedDomLogs.delete(logId);
                        detail.classList.remove('active');
                    } else {
                        expandedDomLogs.add(logId);
                        detail.classList.add('active');
                    }
                }
            });
        });
    }

    // Render Logs entry point
    function renderLogs() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                chrome.storage.local.get({ apiLogs: [], domLogs: [] }, (data) => {
                    const apiChanged = JSON.stringify(data.apiLogs) !== lastApiJson;
                    const domChanged = JSON.stringify(data.domLogs) !== lastDomJson;

                    if (!apiChanged && !domChanged) {
                        return; // Cache hit - no updates to render
                    }

                    if (apiChanged) {
                        lastApiJson = JSON.stringify(data.apiLogs);
                        renderApiList(data.apiLogs);
                    }

                    if (domChanged) {
                        lastDomJson = JSON.stringify(data.domLogs);
                        renderDomList(data.domLogs);
                    }
                });
            } catch (e) {
                console.error('[API Tracker] Failed to render logs:', e);
            }
        } else {
            apiList.innerHTML = '<div class="empty-state">Chrome storage is unavailable. Make sure you open this from the extension popup.</div>';
            domList.innerHTML = '<div class="empty-state">Chrome storage is unavailable. Make sure you open this from the extension popup.</div>';
        }
    }

    // Clear logs
    clearBtn.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                chrome.storage.local.set({ apiLogs: [], domLogs: [] }, () => {
                    lastApiJson = '';
                    lastDomJson = '';
                    expandedApiLogs.clear();
                    expandedDomLogs.clear();
                    renderLogs();
                });
            } catch (e) {
                console.error('[API Tracker] Failed to clear storage logs:', e);
            }
        }
    });

    // Initial render
    renderLogs();
    
    // Live updates listener
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && (changes.apiLogs || changes.domLogs)) {
                renderLogs();
            }
        });
    } else {
        // Polling fallback
        setInterval(renderLogs, 1000);
    }
});
