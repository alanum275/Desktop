# deskside setup

everything in this folder goes into one GitHub repo. Azure hosts it the same way FieldBOL is hosted.

## what's in here

- `index.html` - the whole app
- `manifest.webmanifest`, `sw.js`, `icons/` - make it installable as its own app and keep it opening if the wifi drops
- `api/` - a tiny score relay. only used if ESPN blocks requests from your site. Deskside switches to it on its own
- `staticwebapp.config.json` - Azure settings
- `Open Deskside.bat` - opens Deskside borderless on the mini monitor

## what's on it

5 starter views, all changeable (+ next to the tabs, or Arrange):
- today - your day in one card, the game, music, inbox, checklist
- game day - full live game (bases, count, box score, plays, win odds), the week's schedule, scores around the league
- work - FieldBOL tracker, inbox, FE countdown, notes
- weather - 7-day forecast, sun and daylight left, job site weather with wind/rain flags, calendar
- focus - flip clock, focus timer, checklist, notes, FE study tracker

up top: the island shows what's happening now (live score, meeting in 15 min, running timer). click it to jump there.

## 1. put it online (about 15 min)

1. make a new GitHub repo, something like `deskside`
2. upload everything in this folder to the repo root. keep the folder structure (`api/`, `icons/`)
3. Azure portal, Create a resource, Static Web App
   - plan: Free
   - source: GitHub, pick the repo, branch `main`
   - build presets: Custom
   - app location: `/`
   - api location: `api`
   - output location: leave blank
4. wait for the GitHub Action to finish (a few minutes), then open the site address Azure gives you

## 2. check what works

open the site, then Settings (gear), Connections, Run the check.

- **Address:** should be green on the Azure address
- **Scores:** green either directly or "through your site's relay". if it's red, the api folder didn't deploy. check the Action log in GitHub
- **Weather:** should be green
- **Spotify, Outlook, FieldBOL:** gray until you set them up below

## 3. Spotify (about 10 min)

1. developer.spotify.com/dashboard, Create app
2. redirect URI: copy it from Deskside (Settings, Connections, Spotify). it's your site address
3. tick Web API, save, copy the Client ID into Deskside, press Connect Spotify
4. play/pause/skip need Premium. now playing works on any account

## 4. Outlook (pick one)

### option a: Microsoft sign-in

steps are in Deskside under Settings, Connections, Microsoft 365. needs an app registration in Entra. if IT has to approve it, use option b

### option b: Power Automate flow (no IT needed)

runs under your own login. the trigger is a Premium one, so if Power Automate says you need a license, this option is out.

1. make.powerautomate.com, Create, Instant cloud flow, skip, then pick the trigger **When an HTTP request is received**
2. add **Office 365 Outlook: Send an HTTP request**
   - URI: `https://graph.microsoft.com/v1.0/me/mailFolders/inbox?$select=unreadItemCount`
   - method: GET
   - rename the step `Unread`
3. add **Office 365 Outlook: Get emails (V3)**
   - folder: Inbox, only unread: Yes, top: 5
   - rename it `Mail`
4. add **Office 365 Outlook: Get calendar view of events (V3)**
   - start time: expression `utcNow()`
   - end time: expression `addHours(utcNow(), 12)`
   - rename it `Calendar`
5. add **Data Operation: Select**, rename it `Messages`
   - from: `body('Mail')?['value']`
   - map (switch to text mode and paste):
     `{"from": "@{item()?['from']}", "subject": "@{item()?['subject']}", "received": "@{item()?['receivedDateTime']}"}`
     (if it complains, add the three keys one at a time with those expressions)
6. add another **Select**, rename it `Meetings`
   - from: `body('Calendar')?['value']`
   - map: subject `item()?['subject']`, start `item()?['start']`, location `item()?['location']`, isAllDay `item()?['isAllDay']`
7. add **Response**
   - status code: 200
   - headers: `Content-Type` = `application/json` and `Access-Control-Allow-Origin` = your site address (like `https://xyz.azurestaticapps.net`, no slash at the end)
   - body:
     ```
     {
       "unread": @{body('Unread')?['unreadItemCount']},
       "messages": @{body('Messages')},
       "meetings": @{body('Meetings')}
     }
     ```
8. save, open the trigger, copy the HTTP URL
9. in Deskside: Arrange, Settings on the Outlook card, "Where the mail comes from" = A Power Automate flow, paste the URL, save

notes
- if "Send an HTTP request" isn't in your Outlook connector, skip step 2 and use `length(body('Mail')?['value'])` for unread instead (caps at the top value)
- step names in Power Automate move around sometimes. if something doesn't match, screenshot it and ask Claude
- the flow URL works like a password. anyone with it can read what the flow sends back. it's only saved in your browser. leave out subjects if you don't want them on screen
- meeting times come back in UTC. Deskside converts them, so don't add any time zone math in the flow

## 5. FieldBOL

paste the live tracker share link into the FieldBOL card. if the card stays blank but the connection check says the page is reachable, that page is blocking embedding. Claude can help fix that in the FieldBOL repo

## 6. put it on the mini monitor

1. open Deskside on the mini monitor, go to Settings, Display. it shows "This screen: ... at position X, Y"
2. right-click `Open Deskside.bat`, Edit. put your site address on the URL line and those X and Y numbers on the X and Y lines. save
3. double-click it. Deskside opens full screen, no browser bars, on that monitor
4. to start it at login: Windows+R, `shell:startup`, Enter, drop a shortcut to the .bat in that folder

the launcher uses its own Edge profile (saved in `%LOCALAPPDATA%\Deskside`), so sign into Spotify/Outlook once inside that window. your layout, notes and checklist live there too. Settings, Backup copies your layout if you want to move it.

## good to know

- shortcuts: 1-9 jump to a view, left/right flip views, S StandBy, E arrange, F full screen, Ctrl+K search everything, ? shows them all
- on a touchscreen monitor, swipe left/right to change views
- it nudges everything by a couple of pixels every few minutes so an OLED screen doesn't burn in. turn it off in Settings, Display if you want
- StandBy turns into a giant scoreboard while the Guardians are live, and goes red at night
- it checks for a new version every 30 min and refreshes itself at 4 AM if nobody's using it, so it stays fresh on an always-on screen
- to update: replace `index.html` in the repo. Azure redeploys on its own
