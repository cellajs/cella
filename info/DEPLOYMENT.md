# Deployment

Cella makes it easy to deploy on [Render](https://www.render.com) (server & tus & frontend). Probably more options will become available over time.

## Deploy services to render.com

Go to [blueprints](https://dashboard.render.com/select-repo?type=blueprint) and select the repo by clicking `Connect`.

Speed up the process by using the existing `render.yaml` file in the root. All deployed PRs will use the onrender.com domain.

## Enable Novu Slack notification

[Gide by Novu](https://docs.novu.co/guides/slack-guide).
At first, [create App in Slack](https://api.slack.com/apps) so you can obtain the App ID, Client ID, and Client Secret.

Then, [create Novu Workflow](https://web.novu.co/workflows?page=1&size=10) and select 'Blank workflow'.

The next step is [creating the Slack integration](https://web.novu.co/integrations). Create a Slack provider and add the App ID, Client ID, and Client Secret obtained from the first step. It's important not to forget to activate it. Now, in the workflow, add the 'Chat (Slack)' option to your workflow trigger and configure the message content. Pass variables that you want to use within double curly braces as example {{usersMessage}}.

Also we need to [add incoming webhook](https://api.slack.com/apps/A074GBPK6A1/incoming-webhooks?).

Now, let's create the backend. Install the package.
```
pnpm install @novu/node
```

Create notification sender
```
import { Novu, ChatProviderIdEnum } from '@novu/node';

const notification = (message: string) => {
    const novu = new Novu(env.NOVU_API_KEY);

    // Identify the subscriber, an entity designed to receive notifications. If there is no subscriber with such an ID, create one; otherwise, use the existing one.
    await novu.subscribers.identify('Subscriber identifier', {
        firstName: 'John',
        lastName: 'Bridgenton',
        email: 'fakeEmail@wow.com',
    });

    // Set's notification to chosen channel
      await novu.subscribers.setCredentials('Subscriber identifier', ChatProviderIdEnum.Slack, {
        webhookUrl: 'Webhook that you have created',
      });

    // Send the notification 
    novu.trigger('Your workflow name(default 'untitled')', {
        to: {
        subscriberId: 'Subscriber identifier',
        },

        // In the payload, you need to include the variables that you declared in the workflow trigger's message content.
        payload: {
            usersMessage: message,
        },
    });
}
```