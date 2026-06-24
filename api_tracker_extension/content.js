// Inject inject.js into the main world
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the injected script
window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'api-tracker-inject') {
        const logData = event.data.data;
        console.log(`[API Tracker] [${logData.type}] ${logData.method} ${logData.url}`, {
            Status: logData.status,
            Request: logData.requestBody,
            Response: logData.responseBody
        });
        // Save to chrome storage (keep last 100 entries)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                chrome.storage.local.get({ apiLogs: [] }, (result) => {
                    const logs = result.apiLogs;
                    logs.unshift(logData);
                    if (logs.length > 100) logs.pop();
                    chrome.storage.local.set({ apiLogs: logs });
                });
            } catch (e) {
                console.warn('[API Tracker] Failed to save apiLogs:', e);
            }
        }
    }
});

// Helper to get CSS selector path for an element (including Shadow DOM paths)
function getCSSSelector(el) {
    if (!el) return 'unknown';

    // Handle ShadowRoot
    if (el.nodeType === Node.DOCUMENT_FRAGMENT_NODE || (typeof ShadowRoot !== 'undefined' && el instanceof ShadowRoot)) {
        if (el.host) {
            return `${getCSSSelector(el.host)}::shadow`;
        }
        return 'shadow-root';
    }

    if (el.nodeType !== Node.ELEMENT_NODE) {
        if (el.parentNode) {
            return getCSSSelector(el.parentNode);
        }
        return 'unknown';
    }

    if (el.id && typeof el.id === 'string') {
        return `#${el.id}`;
    }

    let selector = el.tagName.toLowerCase();
    if (el.classList && el.classList.length > 0) {
        const classes = Array.from(el.classList)
            .filter(c => c && typeof c === 'string' && !c.includes(':'))
            .join('.');
        if (classes) {
            selector += `.${classes}`;
        }
    }

    if (el.parentNode && el.parentNode.tagName && el.parentNode !== document.body && el.parentNode !== document.documentElement) {
        const parentSelector = getCSSSelector(el.parentNode);
        return `${parentSelector} > ${selector}`;
    }
    
    // Parent is a shadow root (DocumentFragment)
    if (el.parentNode && el.parentNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const parentSelector = getCSSSelector(el.parentNode);
        return `${parentSelector} > ${selector}`;
    }

    return selector;
}

// Track observed shadow roots to avoid double observation
const observedRoots = new WeakSet();

// Recursively find and observe all Shadow DOM roots in a element subtree
function observeShadowRoots(startNode) {
    if (!startNode) return;
    
    if (startNode.shadowRoot && !observedRoots.has(startNode.shadowRoot)) {
        const shadow = startNode.shadowRoot;
        observedRoots.add(shadow);
        
        try {
            observer.observe(shadow, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeOldValue: true,
                characterData: true,
                characterDataOldValue: true
            });
            observeShadowRoots(shadow);
        } catch (e) {
            console.warn('[API Tracker] Failed to observe shadow root:', e);
        }
    }
    
    let child = startNode.firstChild;
    while (child) {
        if (child.nodeType === Node.ELEMENT_NODE) {
            observeShadowRoots(child);
        }
        child = child.nextSibling;
    }
}

// Setup MutationObserver to watch for DOM changes
const observer = new MutationObserver((mutations) => {
    const changes = [];
    const seenChanges = new Set();

    mutations.forEach((mutation) => {
        const type = mutation.type;
        const target = mutation.target;

        if (type === 'characterData') {
            const oldValue = (mutation.oldValue || '').trim();
            const newValue = (target.nodeValue || '').trim();
            if (oldValue !== newValue) {
                const parentNode = target.parentNode || target.parentElement;
                const selector = getCSSSelector(parentNode);
                const key = `text:${selector}:${oldValue}:${newValue}`;
                if (!seenChanges.has(key)) {
                    seenChanges.add(key);
                    changes.push({
                        type: 'TEXT',
                        selector: selector,
                        oldValue: oldValue,
                        newValue: newValue
                    });
                }
            }
        } else if (type === 'attributes') {
            const attrName = mutation.attributeName;
            const oldValue = mutation.oldValue;
            const newValue = target.getAttribute ? target.getAttribute(attrName) : null;
            
            if (oldValue !== newValue) {
                const selector = getCSSSelector(target);
                const key = `attr:${selector}:${attrName}:${oldValue}:${newValue}`;
                if (!seenChanges.has(key)) {
                    seenChanges.add(key);
                    changes.push({
                        type: 'ATTRIBUTE',
                        selector: selector,
                        attributeName: attrName,
                        oldValue: oldValue === null ? '(null)' : oldValue,
                        newValue: newValue === null ? '(null)' : newValue
                    });
                }
            }
        } else if (type === 'childList') {
            const added = Array.from(mutation.addedNodes)
                .filter(n => n.nodeType === Node.ELEMENT_NODE || (n.nodeType === Node.TEXT_NODE && (n.nodeValue || '').trim()))
                .map(n => {
                    if (n.nodeType === Node.TEXT_NODE) {
                        return `Text: "${(n.nodeValue || '').trim()}"`;
                    }
                    return `<${n.tagName.toLowerCase()}> ${(n.textContent || '').trim().substring(0, 60)}`;
                });
            const removed = Array.from(mutation.removedNodes)
                .filter(n => n.nodeType === Node.ELEMENT_NODE || (n.nodeType === Node.TEXT_NODE && (n.nodeValue || '').trim()))
                .map(n => {
                    if (n.nodeType === Node.TEXT_NODE) {
                        return `Text: "${(n.nodeValue || '').trim()}"`;
                    }
                    return `<${n.tagName.toLowerCase()}> ${(n.textContent || '').trim().substring(0, 60)}`;
                });

            if (added.length > 0 || removed.length > 0) {
                const selector = getCSSSelector(target);
                const key = `child:${selector}:${added.join(',')}:${removed.join(',')}`;
                if (!seenChanges.has(key)) {
                    seenChanges.add(key);
                    changes.push({
                        type: 'CHILD_LIST',
                        selector: selector,
                        added: added,
                        removed: removed
                    });
                }
                
                // Scan added elements for Shadow DOMs
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        observeShadowRoots(node);
                    }
                });
            }
        }
    });

    if (changes.length > 0) {
        const domLog = {
            type: 'DOM_CHANGE',
            timestamp: new Date().toISOString(),
            url: window.location.href,
            changes: changes.slice(0, 20) // Limit to top 20 changes per batch to keep storage small
        };

        // Save to chrome storage (keep last 100 entries)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                chrome.storage.local.get({ domLogs: [] }, (result) => {
                    const logs = result.domLogs;
                    logs.unshift(domLog);
                    if (logs.length > 100) logs.pop();
                    chrome.storage.local.set({ domLogs: logs });
                });
            } catch (e) {
                console.warn('[API Tracker] Failed to save domLogs:', e);
            }
        }
    }
});

// Start observing target (main DOM tree)
observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true
});

// Perform initial search for open shadow roots
observeShadowRoots(document.documentElement);

// Periodic check for any dynamically attached shadow roots that might have been added to existing nodes
setInterval(() => {
    observeShadowRoots(document.documentElement);
}, 2000);
