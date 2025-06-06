module.exports = (RED) => {
    const { default: got } = require('got')
    RED.plugins.registerPlugin('flowfuse-nr-assistant', {
        type: 'assistant',
        name: 'Node-RED Assistant Plugin',
        icon: 'font-awesome/fa-magic',
        settings: {
            '*': { exportable: true }
        },
        onadd: function () {
    const assistantSettings = {
                enabled: process.env.NR_ASSISTANT_ENABLED
                    ? process.env.NR_ASSISTANT_ENABLED === 'true'
                    : RED.settings.flowforge?.assistant?.enabled ?? false,
        
                url: process.env.NR_ASSISTANT_URL || RED.settings.flowforge?.assistant?.url || '',
        
                token: process.env.NR_ASSISTANT_TOKEN || RED.settings.flowforge?.assistant?.token || '',
        
                requestTimeout: parseInt(
                    process.env.NR_ASSISTANT_TIMEOUT || RED.settings.flowforge?.assistant?.requestTimeout || '60000'
                )
            }
        
            const clientSettings = {
                enabled: assistantSettings.enabled && !!assistantSettings.url,
                requestTimeout: assistantSettings.requestTimeout
            }

            RED.comms.publish('nr-assistant/initialise', clientSettings, true /* retain */)

            if (!assistantSettings || !assistantSettings.enabled) {
                RED.log.info('FlowFuse Assistant Plugin is disabled')
                return
            }
            if (!assistantSettings.url) {
                RED.log.info('FlowFuse Assistant Plugin is missing url')
                return
            }

            RED.log.info('FlowFuse Assistant Plugin loaded')

            RED.httpAdmin.post('/nr-assistant/:method', RED.auth.needsPermission('write'), function (req, res) {
                const method = req.params.method
                // limit method to prevent path traversal
                if (!method || typeof method !== 'string' || /[^a-z0-9-_]/.test(method)) {
                    res.status(400)
                    res.json({ status: 'error', message: 'Invalid method' })
                    return
                }
                const input = req.body
                if (!input || !input.prompt || typeof input.prompt !== 'string') {
                    res.status(400)
                    res.json({ status: 'error', message: 'prompt is required' })
                    return
                }
                const body = {
                    prompt: input.prompt, // this is the prompt to the AI
                    promptHint: input.promptHint, // this is used to let the AI know what we are generating (`function node? Node JavaScript? flow?)
                    context: input.context, // this is used to provide additional context to the AI (e.g. the selected text of the function node)
                    transactionId: input.transactionId // used to correlate the request with the response
                }
                // join url & method (taking care of trailing slashes)
                const url = `${assistantSettings.url.replace(/\/$/, '')}/${method.replace(/^\//, '')}`
                got.post(url, {
                    headers: {
                        Accept: '*/*',
                        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,es;q=0.7',
                        Authorization: `Bearer ${assistantSettings.token}`,
                        'Content-Type': 'application/json'
                    },
                    json: body
                }).then(response => {
                    const data = JSON.parse(response.body)
                    res.json({
                        status: 'ok',
                        data
                    })
                }).catch((error) => {
                    let body = error.response?.body
                    if (typeof body === 'string') {
                        try {
                            body = JSON.parse(body)
                        } catch (e) {
                            // ignore
                        }
                    }
                    let message = 'FlowFuse Assistant request was unsuccessful'
                    const errorData = { status: 'error', message, body }
                    const errorCode = error.response?.statusCode || 500
                    res.status(errorCode).json(errorData)
                    RED.log.trace('nr-assistant error:', error)
                    if (body && typeof body === 'object' && body.error) {
                        message = `${message}: ${body.error}`
                    }
                    RED.log.warn(message)
                })
            })
        }
    })
}
