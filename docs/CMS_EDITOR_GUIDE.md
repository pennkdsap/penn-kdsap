# Penn KDSAP Pages CMS editor guide

## First-time connection

1. Sign in at [Pages CMS](https://app.pagescms.org/) with the GitHub account that can access `pennkdsap/penn-kdsap`.
2. Install or authorize the Pages CMS GitHub App for that repository.
3. Open **Website pages**. A saved change commits to `main`, and GitHub Pages publishes it automatically.

## Editors using email

After the repository owner connects the GitHub App, they can invite the chapter email as a collaborator in Pages CMS. Open [Pages CMS](https://app.pagescms.org/), choose **Continue with email**, and use the sign-in link sent to the invited mailbox. A Gmail session alone does not grant repository access.

Email collaborators can edit content and images in the invited repository; managing collaborators and CMS configuration requires the GitHub account with repository access.

## Add or update a leadership member

1. Open **Website pages → Leadership team**.
2. Expand an existing member to change their name, leadership title, group label, portrait, or portrait description.
3. Use **Add item** under **Leadership members** to create a member.
4. Drag member cards into display order.
5. Turn off **Show on website** to retain a member in the CMS without publishing their card.
6. Save. The new version will publish after the GitHub Pages deployment completes.

Use a vertical portrait when possible. The site displays portraits at a 2:3 ratio. A useful accessible description is `Portrait of Firstname Lastname`.

## Add a public event

1. Open **Website pages → Events and calendar**.
2. Under **Upcoming public events**, use **Add item**.
3. Enter the month, day, event type, title, location, and optional registration/details link.
4. Drag events into chronological order and save.

The full list appears on the Events page. The first three items automatically appear in the homepage quick calendar.

To link a Google Calendar, make a separate public-facing calendar and paste its **Public URL to this calendar** into **Public Google Calendar URL**. Paste its **Public address in iCal format** into **Public iCal feed URL**. Never paste the Secret address in iCal format. The site rebuilds each morning, updates the custom three-month calendar, and features events within the configured homepage window (60 days by default).

## Update the homepage map and impact figures

- Open **Website pages → Homepage → Homepage screening map** to add, remove, reorder, or edit locations. Each pin needs a name, address, date, latitude, and longitude.
- Open **Website pages → Homepage → Homepage impact numbers** to update a value and its description. Update the reporting-period note and source link at the same time.

## Update other page text and images

Open **Website pages → Other website pages**, choose a page, edit its labeled fields, and save. Global navigation, calls to action, footer text, homepage sections, and accessibility labels are in **Homepage**.

## Connect the contact form

The form remains disabled until **Contact → Form endpoint** contains a secure form-processing endpoint. Use a provider that supports spam protection and does not expose private credentials in browser code. The form should not collect medical records or sensitive health information.
