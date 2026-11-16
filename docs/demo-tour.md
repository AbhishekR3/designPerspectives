# A tour of the demo

The demo is a made-up bank, Big Bank plc, modelled the way a team would model a system it runs in production. It starts from the C4 model's Internet Banking System example and adds what surrounds that system in real life: payments with fraud checks, notifications, sessions, statements, monitoring and the people who run it all. Every name, number, cost, rating and link is invented.

This tour takes about 30 minutes. Each stop says what to click and what to notice. You can stop at any point; nothing you do here touches anything outside the demo folder.

## Start the demo

```bash
npm install -g github:AbhishekR3/designPerspectives   # once; see the README for other ways
mkdir bank-demo && cd bank-demo
dp serve --demo
```

This creates `architecture/` (the model) and `sample_code/` (the code the model points to), then opens the app in your browser at `http://127.0.0.1:8765`. A new demo folder also becomes a git repository with four made-up commits (the last one two days ago), so backtracking (stop 8) has history to show; this is skipped when the folder is already inside a git repository. `dp serve --demo` also runs a small demo bank web app at `http://127.0.0.1:4200` (stop 9), which writes OpenTelemetry traces to `traces/`.

What is in the model:

| Level | What you will find |
|---|---|
| People | Personal Banking Customer, Customer Service Staff, Back Office Staff, Fraud Analyst, Site Reliability Engineer |
| Software systems | Internet Banking System, Mainframe Banking System, Fraud Detection System, Analytics Platform, E-mail System, ATM; outside the bank: Payment Network, SMS Gateway, Push Notification Service, Monitoring Platform |
| Containers (inside Internet Banking System) | Single-Page Application, Mobile App, Web Application, API Application, Payments Service, Notification Service, Payment Events, Session Cache, Database, Statement Job, Statement Store |
| Components | Inside API Application, Payments Service, Notification Service, Statement Job (one per pipeline stage) and the analytics Pipeline Worker |
| Code | Python files behind the API and pipeline components, TypeScript files behind the payments, notification and statement components |
| Flows | Sign in, View account balances, Make a payment, Payment confirmation, Publish usage event |

## 1. The big picture

You start on the **System landscape**: every person and software system, with the lines between them.

- Drag the canvas to pan; scroll to zoom. **Auto-layout** in the top-right toolbar lays the diagram out again.
- Click **Internet Banking System**. The panel on the right shows its description, owner (Digital Channels team), links, tags and connections.
- Notice the dashed lines. They are *derived*: no one drew "Internet Banking System → Monitoring Platform", but containers inside it send telemetry there, so the line appears at this level.

## 2. Go down a level

C4 diagrams nest. Double-click to go inside; use the breadcrumb (top left) or **Back** (Alt+Left) to come out.

1. Double-click **Internet Banking System**. These are its containers: the things you deploy. The production parts are here: Payments Service, Notification Service, Payment Events (a Kafka topic), Session Cache (Redis) and Statement Store (S3), next to the web, mobile and API applications.
2. Open the diagram list (**Diagrams**, top left). It lists every diagram by C4 level. The **C1** context diagram for Internet Banking System shows the system on its own with everything it talks to; open it, then come back to the containers.
3. Double-click **Payments Service** to see its five components and how a payment moves between them.
4. Double-click **Payments Controller**. This is the **code** level: the files mapped to the component and the imports between them. Double-click `controller.ts` to read it in the browser.

The symbol on each box (service, database, queue, cache, storage, cloud) comes from its type, which you can change from the bar above a selected box.

## 3. Read an object like an engineer

Go back to the containers diagram and click **Payments Service**. Scroll the panel:

- **Technology**: TypeScript, Node.js, shown as tags.
- **Owner** and **links**: the team, plus a runbook, a dashboard and the repository.
- **Details**: tables for the endpoints, service level objectives and deployment settings. Click **Payment Events**, **Session Cache** and **Monitoring Platform** for more tables (topic settings, event types, cache settings, alert rules).
- **Characteristics**: ratings from 1 to 5 for availability, scalability and so on. The *driving* ones are what this part must be good at.
- **Cost**: monthly cost lines. Systems and containers add up everything inside them.
- **Work**: open pull requests, security issues and backlog items linked to this object.
- **Notes, tradeoffs, usage, sensitive**: why it was built this way, who uses it and how often, and what data needs protecting.

Click a line too, for example **Fraud Check Client → Fraud Detection System** on the Payments Service diagram. Lines carry notes, sensitivity labels and work items as well.

## 4. Play a flow

Flows tell a story over the relationships in the model, one step at a time.

1. Open the **Flows** menu (top left, below the breadcrumb) and pick **Make a payment**.
2. Step through with **Next**. Each step highlights one line and shows who sends what to whom. Many steps include example data: the HTTP request, the Redis command, the MQ message, the Kafka record.
3. Notice the responses (balance, fraud score, mainframe reference) travelling back along the same lines.
4. Then play **Payment confirmation**: what happens after the payment, from the event on the topic to a push notification on the customer's phone.

## 5. Colour the diagram: overlays

The dock at the bottom left colours boxes by one property at a time. Try these on the containers diagram:

| Overlay | Try | What it tells you |
|---|---|---|
| **Tags → Tier** | Pick Tier, then click **Tier 1** and choose **Focus** | Which parts must never go down |
| **Tags → Hosting** | Pick Hosting | What runs in the cloud, on premises or at a third party |
| **Tags → Risk / Lifecycle** | Pick Lifecycle | What is planned, live or deprecated (look at the E-mail Component inside API Application) |
| **Characteristics** | Pick Availability | Where availability is weak |
| **Cost** | Monthly cost | Where the money goes; the Fraud Detection System's licence and the mainframe stand out |
| **Work** | Security issue | Where open security work is |
| **Technology** | By technology | Which parts share a technology |

**Focus** dims everything else; **Hide** removes the boxes with that value. Remove the filter to see everything again.

## 6. Switch lenses

A lens is a set of defaults for one audience: which levels it starts on, which overlay is on, which panel sections and tag groups show. Use the lens switcher (top right):

- **Architect**: everything.
- **Engineer**: containers, components and code.
- **Overview**: landscape and context only, without technology or cost.
- **Security review**: Risk overlay; sensitive data, tradeoffs and work first.
- **Product owner**: landscape to containers, Lifecycle overlay, no technology.
- **Operations**: Tier overlay; details (SLOs, alerts, runbooks), usage and work.
- **Finance**: cost overlay, cost and usage sections only.

A lens does not hide data: anyone can still open any panel section. It only chooses what shows first.

## 7. Look inside a connector

Some lines are more than one hop. Double-click the thick purple line **Event Stream → Data Warehouse** (on the Analytics Platform containers diagram) to see its stages: consume, mask personal data, load. Each stage links to the component that does the work. A single click on the line shows a sample of the data at every stage: notice that **Mask PII** is marked as removing `email` and `user_id` and adding `user_ref`. The line **Mainframe Banking System → Statement Store** is another, with ten stages from fetching the batch file to uploading the encrypted statement.

## 8. Backtrack a problem to its cause

The statement pipeline has a known issue, listed under its linked work: the printed closing balance is a cent off for foreign-currency accounts. Open the connector **Mainframe Banking System → Statement Store** (double-click the line on the Internet Banking System containers diagram, or pick it under C3 in the sidebar) and click **↶ backtrack** next to stage 8, **Render PDF statements**.

- The box at the top lists what changed in the last 14 days: **5. Convert currency** and **7. Apply fees and interest**. Both are marked in the list of steps.
- The table follows `closingBalance` back through the steps: it appears at stage 6 and changes at stage 7. Click a field name above the table to follow another one.
- Click step **5**. Its sample shows `amount` added as `-42.27`: the converted amount is already rounded to cents. Under Code, `convert_currency.ts` shows the commit from two days ago ("round each converted amount to cents"), and the functions it changed, `convert` and `roundCents`, are marked. Click the file name to read it.
- Click step **7**. Its model history says the stage was added six days ago. It changes the balance on purpose (fees and interest), so step 5 is the better suspect: rounding each line before adding them up loses fractions of a cent.

Backtrack also works from a flow step (the **Backtrack from this step** button in the flow panel) and from any stage panel.

## 9. Watch the web app

On the Internet Banking System containers diagram, click **Single-Page Application** and then **Inspect live UI**. The demo bank web app opens inside dp. Click **Pay now**:

- the side panel shows the call `POST /api/payments`, the relationship it uses, what was sent and returned (the password and IBAN fields are masked), and the documented example;
- **Observed in traces** shows the path the request really took, read from the trace file the app wrote: controller, session cache, orchestrator, validator, fraud check, mainframe, event publisher. Every step has a relationship in the model.

Now click **Today's rates**. The call matches no endpoint (add it to a relationship with one click), and the trace reaches `fx-rates-provider`, which the model does not have: the panel says the running system differs from the model. **Show statements** shows a closing balance of €1,202.47 while the account says €1,202.48: the issue from stop 8.

## 10. Find anything

Press **Ctrl/Cmd+K** and type `redis`, `fraud` or `kafka`. Search covers names, descriptions and technology; it opens as a dialog. Press **?** for every keyboard shortcut.

To select several boxes, Shift+click or Ctrl/Cmd+click them, or Shift+drag over empty canvas. Then drag them, use the arrow keys, or press Delete to remove them together.

## 11. Plan a change in a draft

Real architecture changes are planned before they are built. A draft is a copy of the model you can change freely; the main model stays as it is until you apply the draft.

The demo already has one: under **Drafts**, open *Tell customers when a payment is held* (its author is "Demo"). It adds a container (**Held Payment Notifier**), changes the **Payments Service** description, adds a line between them and proposes a decision. In the draft strip, switch between **Since it started** (only what the draft changes) and **Against main now** (also what main has changed since). Then try the steps below on a draft of your own.

1. In the sidebar, under **Drafts**, click **+ New draft**. Title it *Open banking API* and describe it: *Let licensed third parties read account balances with the customer's consent.*
2. On the containers diagram, drag a **Service / API** from the palette (left of the canvas) and name it *Open Banking API*. Connect it to **API Application** by dragging from one of its dots onto that box.
3. Drag from one of Open Banking API's dots to an empty part of the canvas and pick **External system**. Name it *Third-party Provider*. (On a containers diagram, a new person or system always comes with a line, because the diagram only shows outside things that connect to something inside.)
4. Change something that already exists, such as the **Session Cache** description, and delete something, such as the deprecated **E-mail Component** inside API Application.
5. Turn on **Changes** in the dock: added, changed and removed objects are coloured. Removed ones stay as faded ghosts. The change list shows each field before and after.
6. In the draft strip, open **Coding plan…** to see the work the draft implies for the code.
7. **Apply** merges the draft into the main model as one step you can undo; **Discard** throws it away.

## 12. Compare with git

When the demo folder is a git repository, you can see what changed between commits.

```bash
git init && git add -A && git commit -m "Demo as installed"
```

Make a few edits in the app, then under **Drafts → Git** pick your branch (or **Other…** to type any branch, tag or commit) and press **Compare**. The same colours show what changed since the commit. **Open** shows that version read-only.

On the command line:

```bash
dp check                 # model problems (exit code 1 if any)
dp diff --base HEAD      # what changed since the commit, as Markdown for a pull request
```

## 13. Try the roles

Sign-in is off by default. Turn it on to see what each role can do:

```bash
dp users init            # creates architect, engineer and viewer, and prints their passwords once
dp serve
```

Sign in as **engineer**: you can read everything and make drafts, but you cannot change the main model or apply a draft. An engineer changes and discards only the drafts they started. The sample draft belongs to "Demo", so for an engineer it is read-only; start a draft of your own to change one. An **architect** changes any draft. Sign in as **viewer**: you can read everything and change nothing.

## Start your own

When you are done, run `dp serve` in your own project folder. It starts from an empty model with a three-step "Start your architecture" card. Copying the demo's patterns is a good start: an owner and a runbook link on every container, a Tier tag, SLOs in a details table, and one flow for each of your most important user journeys.
