const xoxdCookie = `d=${encodeURIComponent(Deno.env.get("USER_XOXD")!)}`
async function installApp() {
    const oauthPage = await (
        await fetch(
            `https://hackclub.slack.com/oauth?client_id=${Deno.env.get("APP_CLIENT_ID")}&scope=${encodeURIComponent(Deno.env.get("APP_SCOPES")!)}&user_scope=&redirect_uri=&state=&granular_bot_scope=1&single_channel=0&install_redirect=oauth&tracked=1&user_default=0&team=1`,
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
            body: `create_authorization=1&client_id=${Deno.env.get("APP_CLIENT_ID")}&state=&granular_bot_scope=1&scope=${encodeURIComponent(Deno.env.get("APP_SCOPES")!)}&user_scope=&redirect_uri=https%3A%2F%2Fapi.slack.com%2Fapps%2F${Deno.env.get("APP_ID")}%2Foauth&install_redirect=oauth&single_channel=&response_type=&response_mode=&nonce=&openid_connect=0&code_challenge=&code_challenge_method=&crumb=${encodeURIComponent(crumb)}`,
            method: "POST",
            redirect: "manual",
        })
    ).headers.get("location")
    fetch(oauthFinalURL!, {
        headers: {
            Cookie: xoxdCookie,
        },
    })
}

await installApp()

Deno.serve({ port: 7531 }, (_req) => {
    return new Response("")
})
