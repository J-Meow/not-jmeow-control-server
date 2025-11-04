import { decodeBase64 } from "jsr:@std/encoding/base64"

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

Deno.serve({ port: 7531 }, async (req, connInfo) => {
    const url = new URL(req.url)
    const queryParams = url.searchParams
    if (url.pathname == "/connect") {
        if (queryParams.get("secret") != Deno.env.get("CONNECTION_SECRET")) {
            console.log(
                "Failed connection from IP " +
                    connInfo.remoteAddr.hostname +
                    " with invalid connection secret: " +
                    queryParams.get("secret"),
            )
            return new Response(null, { status: 403 })
        }
        if (req.headers.get("upgrade") != "websocket") {
            return new Response(null, { status: 426 })
        }
        const { socket, response } = Deno.upgradeWebSocket(req)
        const tokenBuffer = textEncoder.encode(mainAppToken)
        const encryptedToken = await crypto.subtle.encrypt(
            "RSA-OAEP",
            keyPair.public,
            tokenBuffer,
        )
        socket.addEventListener("open", () => {
            console.log(
                "Socket connected from IP " + connInfo.remoteAddr.hostname,
            )
            socket.send(encryptedToken)
        })
        return response
        // return new Response(encryptedToken)
    }
    return new Response("", { status: 404 })
})
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
