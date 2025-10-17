## Enable Novu Slack notification

> [!WARNING]
> Work in progress

[Guide by Novu](https://docs.novu.co/guides/slack-guide).
At first, [create App in Slack](https://api.slack.com/apps) so you can obtain the App ID, Client ID, and Client Secret.

Then, [create Novu Workflow](https://web.novu.co/workflows?page=1&size=10) and select 'Blank workflow'.

The next step is [creating the Slack integration](https://web.novu.co/integrations). Create a Slack provider and add the App ID, Client ID, and Client Secret obtained from the first step. It's important not to forget to activate it. Now, in the workflow, add the 'Chat (Slack)' option to your workflow trigger and configure the message content. Pass variables that you want to use within double curly braces as example {{usersMessage}}.

Also we need to [add incoming webhook](https://api.slack.com/apps/A074GBPK6A1/incoming-webhooks?).

## Enable Element Notifications

Follow these steps to set up Matrix (Element) notifications for your system:

> **Important:** By default, system uses the public Matrix.org server:
> If you are not using the standard public server, update `matrixURL` in your app configuration to point to your own server.

### Create a Space in Element

A **Space** in Element is like a workspace or folder where you can organize multiple rooms.

- Follow the official guide: [Creating a Space](https://docs.element.io/latest/element-support/matrix-spaces/getting-started-creating-a-space)
- This step is necessary before creating rooms.

---

### Create a Room in the Space

A **Room** is where messages will be sent.

- Follow the guide: [Creating a Room](https://docs.element.io/latest/element-support/matrix-rooms/getting-started-creating-a-room)
- After creating the room, go to **Room Info → Settings → Advanced**
- Copy the **Internal Room ID** (looks like `!abc123:matrix.org`)
- Add it to your `.env` file:

```env
ELEMENT_ROOM_ID=!your_room_id_here
```

### Create a Bot Account

Your system will send messages using a bot account.

- Create a new "Bot" account in Element
- Invite "Bot" account to the target room where messages will be sent.
- Go to **All settings → Help & About → Advanced → Access Token**
- Copy the token and add it to your .env file:

```env
ELEMENT_BOT_ACCESS_TOKEN=your_bot_access_token_here
```
