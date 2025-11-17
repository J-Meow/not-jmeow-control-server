import { decodeBase64 } from "jsr:@std/encoding/base64"
const { createHmac } = await import("node:crypto")

const keyPair = {
    private: await crypto.subtle.importKey(
        "pkcs8",
        decodeBase64(Deno.env.get("PRIVATE_KEY")!),
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["decrypt"],
    ),
    public: await crypto.subtle.importKey(
        "spki",
        decodeBase64(Deno.env.get("PUBLIC_KEY")!),
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["encrypt"],
    ),
}
const xoxdCookie = `d=${encodeURIComponent(Deno.env.get("USER_XOXD")!)}`
async function installApp(appId: string) {
    const appPage = await (
        await fetch(`https://api.slack.com/apps/${appId}/general`, {
            headers: {
                Cookie: xoxdCookie,
            },
        })
    ).text()
    const clientId = appPage.split("?client_id=")[1].split("&amp;")[0]
    const scopes = encodeURIComponent(
        appPage.split("&amp;scope=")[1].split('"')[0],
    )
    const oauthPage = await (
        await fetch(
            `https://hackclub.slack.com/oauth?client_id=${clientId}&scope=${scopes}&user_scope=&redirect_uri=&state=&granular_bot_scope=1&single_channel=0&install_redirect=oauth&tracked=1&user_default=0&team=1`,
            {
                headers: {
                    Cookie: xoxdCookie,
                },
            },
        )
    ).text()

    const crumb = oauthPage.split('crumb" value=\"')[1].split('"')[0]
    const oauthConfirmURL =
        "https://hackclub.slack.com/oauth/" +
        oauthPage.split('action="/oauth/')[1].split('"')[0]
    const oauthFinalURL = (
        await fetch(oauthConfirmURL, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Cookie: xoxdCookie,
            },
            body: `create_authorization=1&client_id=${clientId}&state=&granular_bot_scope=1&scope=${scopes}&user_scope=&redirect_uri=https%3A%2F%2Fapi.slack.com%2Fapps%2F${appId}%2Foauth&install_redirect=oauth&single_channel=&response_type=&response_mode=&nonce=&openid_connect=0&code_challenge=&code_challenge_method=&crumb=${encodeURIComponent(crumb)}`,
            method: "POST",
            redirect: "manual",
        })
    ).headers.get("location")
    const finalData = await (
        await fetch(oauthFinalURL!, {
            headers: {
                Cookie: xoxdCookie,
            },
        })
    ).text()
    return "xoxb-" + finalData.split('value="xoxb-')[1].split('"')[0]
}

const mainAppToken = await installApp(Deno.env.get("APP_ID")!)
const startMessage = await (
    await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + mainAppToken,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
            channel: Deno.env.get("HOME_CHANNEL"),
            attachments: [
                {
                    color: "#00cc00",
                    blocks: [
                        {
                            type: "section",
                            text: {
                                type: "plain_text",
                                text: "Started",
                                emoji: true,
                            },
                        },
                    ],
                },
            ],
        }),
    })
).json()

const textEncoder = new TextEncoder()

const modulesConnected: string[] = []

const eventSockets: { [key: string]: WebSocket[] } = {}

Deno.serve(
    {
        port: 7531,
        cert: Deno.readTextFileSync(Deno.env.get("SSL_CERT_PATH")!),
        key: Deno.readTextFileSync(Deno.env.get("SSL_KEY_PATH")!),
    },
    async (req, connInfo) => {
        const url = new URL(req.url)
        const queryParams = url.searchParams
        if (url.pathname == "/connect") {
            if (
                queryParams.get("secret") != Deno.env.get("CONNECTION_SECRET")
            ) {
                log(
                    "Failed connection from IP " +
                        connInfo.remoteAddr.hostname +
                        " with invalid connection secret: " +
                        queryParams.get("secret"),
                    true,
                    "🚨",
                )
                return new Response(null, { status: 403 })
            }
            if (!queryParams.has("module")) {
                return new Response(null, { status: 400 })
            }
            const moduleName = queryParams.get("module")!
            if (req.headers.get("upgrade") != "websocket") {
                return new Response(null, { status: 426 })
            }
            const { socket, response } = Deno.upgradeWebSocket(req)
            const eventsListening: string[] = []
            if (queryParams.has("events")) {
                eventsListening.push(...queryParams.get("events")!.split(","))
            }
            eventsListening.forEach((event) => {
                if (!Object.keys(eventSockets).includes(event)) {
                    eventSockets[event] = []
                }
                eventSockets[event].push(socket)
            })
            const tokenBuffer = textEncoder.encode(mainAppToken)
            const encryptedToken = await crypto.subtle.encrypt(
                "RSA-OAEP",
                keyPair.public,
                tokenBuffer,
            )
            socket.addEventListener("open", () => {
                log(
                    "Socket connected from IP " +
                        connInfo.remoteAddr.hostname +
                        ", module name: " +
                        moduleName +
                        ", event subscriptions: " +
                        eventsListening.join(","),
                    false,
                    "🟩",
                )
                socket.send(encryptedToken)
                modulesConnected.push(moduleName)
                log("Connected modules: \n" + modulesConnected.join("\n"))
            })
            socket.addEventListener("close", () => {
                log(
                    "Socket disconnected from IP " +
                        connInfo.remoteAddr.hostname +
                        ", module name: " +
                        moduleName,
                    false,
                    "🚫",
                )
                modulesConnected.splice(modulesConnected.indexOf(moduleName), 1)
                log("Connected modules: \n" + modulesConnected.join("\n"))
                eventsListening.forEach((event) => {
                    eventSockets[event].splice(
                        eventSockets[event].indexOf(socket),
                        1,
                    )
                })
            })
            socket.addEventListener("error", (ev) => {
                log(
                    "Socket error from IP " +
                        connInfo.remoteAddr.hostname +
                        ", module name: " +
                        moduleName +
                        " with error:\n" +
                        (ev as ErrorEvent).message,
                    false,
                    "⚠️",
                )
                modulesConnected.splice(modulesConnected.indexOf(moduleName), 1)
                log("Connected modules: \n" + modulesConnected.join("\n"))
            })
            return response
        }
        if (
            (url.pathname == "/slack/events" ||
                url.pathname == "/slack/interactions") &&
            req.method == "POST"
        ) {
            if (
                Math.abs(
                    parseInt(req.headers.get("X-Slack-Request-Timestamp")!) -
                        Math.floor(Date.now() / 1000),
                ) > 300
            ) {
                log("Invalid timestamp blocked")
                return new Response("", { status: 403 })
            }
            const body = await req.text()
            const hmac = createHmac(
                "sha256",
                Deno.env.get("SLACK_SIGNING_SECRET")!,
            )
            hmac.update(
                `v0:${req.headers.get("X-Slack-Request-Timestamp")}:${body}`,
            )
            if (
                "v0=" + hmac.digest("hex") !=
                req.headers.get("X-Slack-Signature")
            ) {
                log("Invalid signature blocked")
                return new Response("", { status: 403 })
            }
            if (url.pathname == "/slack/events") {
                const reqData = JSON.parse(body)
                console.log(reqData)
                if (reqData.type == "url_verification") {
                    return new Response(reqData.challenge)
                } else if (reqData.type == "event_callback") {
                    const sockets = []
                    if (
                        Object.keys(eventSockets).includes(reqData.event.type)
                    ) {
                        sockets.push(...eventSockets[reqData.event.type])
                    }
                    sockets.forEach((socket) => {
                        socket.send("event " + JSON.stringify(reqData.event))
                    })
                }
            }
            if (url.pathname == "/slack/interactions") {
                const payload = JSON.parse(
                    decodeURIComponent(body)
                        .replaceAll("+", " ")
                        .split("payload=")
                        .slice(1)
                        .join("payload="),
                )
                payload.actions.forEach((action: { action_id: string }) => {
                    const sockets = []
                    if (
                        Object.keys(eventSockets).includes(
                            "interaction-" + action.action_id,
                        )
                    ) {
                        sockets.push(
                            ...eventSockets["interaction-" + action.action_id],
                        )
                    }
                    sockets.forEach((socket) => {
                        socket.send(
                            "event " +
                                JSON.stringify({
                                    type: "interaction-" + action.action_id,
                                    action,
                                }),
                        )
                    })
                })
            }
            return new Response(null, { status: 204 })
        }
        return new Response("", { status: 404 })
    },
)
async function log(
    msg: string,
    important: boolean = false,
    emoji: string | null = null,
) {
    console.log(emoji ? emoji + " " + msg : msg)
    await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + mainAppToken,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
            channel: Deno.env.get("LOGS_CHANNEL"),
            text: emoji ? emoji + " " + msg : msg,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: (emoji ? emoji + " " : "") + "```" + msg + "```",
                    },
                },
                ...(important
                    ? [
                          {
                              type: "context",
                              elements: [
                                  {
                                      type: "mrkdwn",
                                      text: "<!channel>",
                                  },
                              ],
                          },
                      ]
                    : []),
            ],
        }),
    })
}
async function existenceMessage() {
    await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + mainAppToken,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
            channel: Deno.env.get("HOME_CHANNEL"),
            thread_ts: startMessage.ts,
            attachments: [
                {
                    color: "#7777cc",
                    blocks: [
                        {
                            type: "section",
                            text: {
                                type: "plain_text",
                                text: "I still exist",
                                emoji: true,
                            },
                        },
                    ],
                },
            ],
        }),
    })
}
setInterval(existenceMessage, 15 * 60000)
log("Started up", true)
