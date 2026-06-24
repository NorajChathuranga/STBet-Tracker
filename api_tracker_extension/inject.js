(function() {
    // Force Shadow DOMs to be 'open' so the content script can observe them
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init) {
        if (init && init.mode === 'closed') {
            init.mode = 'open';
        }
        return originalAttachShadow.call(this, init);
    };

    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest.prototype.open;
    const originalXHRSend = window.XMLHttpRequest.prototype.send;

    // Intercept Fetch
    window.fetch = async function(...args) {
        const url = args[0];
        const options = args[1] || {};
        const method = options.method || 'GET';
        
        let requestBody = null;
        if (options.body) {
            try {
                requestBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
            } catch (e) {
                requestBody = options.body;
            }
        }

        const logEntry = {
            type: 'FETCH',
            url: typeof url === 'object' ? url.url : url,
            method: method,
            requestBody: requestBody,
            timestamp: new Date().toISOString()
        };

        try {
            const response = await originalFetch.apply(this, args);
            // Clone the response to read body without consuming it
            const clonedResponse = response.clone();
            clonedResponse.text().then(text => {
                let parsedResponse = text;
                try {
                    parsedResponse = JSON.parse(text);
                } catch (e) {}

                window.postMessage({
                    source: 'api-tracker-inject',
                    data: {
                        ...logEntry,
                        status: response.status,
                        responseBody: parsedResponse
                    }
                }, '*');
            });
            return response;
        } catch (error) {
            window.postMessage({
                source: 'api-tracker-inject',
                data: {
                    ...logEntry,
                    status: 'FAILED',
                    error: error.message
                }
            }, '*');
            throw error;
        }
    };

    // Intercept XMLHttpRequest
    window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._method = method;
        this._url = url;
        return originalXHR.apply(this, [method, url, ...args]);
    };

    window.XMLHttpRequest.prototype.send = function(body, ...args) {
        const logEntry = {
            type: 'XHR',
            url: this._url,
            method: this._method,
            timestamp: new Date().toISOString()
        };

        if (body) {
            try {
                logEntry.requestBody = typeof body === 'string' ? JSON.parse(body) : body;
            } catch (e) {
                logEntry.requestBody = body;
            }
        }

        this.addEventListener('load', () => {
            let parsedResponse = this.responseText;
            try {
                parsedResponse = JSON.parse(this.responseText);
            } catch (e) {}

            window.postMessage({
                source: 'api-tracker-inject',
                data: {
                    ...logEntry,
                    status: this.status,
                    responseBody: parsedResponse
                }
            }, '*');
        });

        this.addEventListener('error', () => {
            window.postMessage({
                source: 'api-tracker-inject',
                data: {
                    ...logEntry,
                    status: 'FAILED'
                }
            }, '*');
        });

        return originalXHRSend.apply(this, [body, ...args]);
    };
})();
