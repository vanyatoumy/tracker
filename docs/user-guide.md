# Suivi Prospection — User Guide

This guide is for distributors using the app day-to-day to track their
prospecting. For technical documentation (installation, API, database),
see [technical.md](technical.md).

The app's interface is in French — this guide describes what each screen
does using its French labels, translated inline.

## 1. Creating an account and logging in

The welcome screen presents the tool (what it does, the subscription price
and the steps to get started) next to two tabs:

- **Connexion** (Login): phone number (with country code) + password.
- **Créer un compte** (Create account): full name, phone number, password
  (6 characters minimum).

New accounts are created **inactive**: pay the subscription (instructions
under **"⋮" → "Mon abonnement"** or from your admin), then the admin
activates your account. Each activation grants access for a fixed period
(30 days by default).

When the subscription expires, you get **3 days of grace**: the account
stays viewable **read-only**, with a red banner and a "Comment renouveler"
(How to renew) button. On the mobile app, changes made offline during those
days are kept and synced once renewed. After that, access stops. An
account deactivated by the admin is cut off immediately.

Each account is fully isolated — you only ever see your own contacts,
never another distributor's.

After 4 wrong passwords from the same device / connection, that device is
locked out of the account for 15 minutes (anti-brute-force protection).
Other devices are not affected: someone guessing your password can't stop
you from logging in. An admin can lift every lockout from the Admin area.

## 2. "Aujourd'hui" (Today — home screen)

The screen that opens at login: **who to contact today**, most urgent
first.

**Bien démarrer** (Getting started): on a new account, a card at the top
guides the first three steps (add your contacts, prepare your messages
with the provided **starter templates**, send your first message). It
disappears once all three are done, or with "Masquer" (Hide). A contact only appears in one section, the most urgent one.

- **Anniversaires** (Birthdays): contacts whose birthday is today.
- **Relances en retard** (Overdue follow-ups): the planned follow-up date
  has passed.
- **Relances d'aujourd'hui** (Today's follow-ups).
- **Réachats à proposer** (Reorders to offer): clients whose reorder delay
  has been reached (see § 6).
- **Contacts qui refroidissent** (Going cold): in-progress contacts
  (Contacté to En décision) with no movement for 7+ days and no follow-up
  planned.
- **Jamais contactés** (Never contacted): new contacts with no follow-up
  planned.

On each row:

- **Message** opens the WhatsApp message window (see § 5).
- **Demain** (Tomorrow) schedules a follow-up for 9am tomorrow.
- Clicking the name opens the contact's record.

Long sections show the first 10 contacts and a "Voir les N autres" (Show N
more) button. On wide screens, sections flow into two columns.

## 3. The pipeline ("Pipeline" tab)

A 7-column kanban board representing the stages of a relationship with a
contact:

1. **À contacter** (To contact — on your list, not reached yet)
2. **Contacté** (Contacted)
3. **Prospect**
4. **Intéressé** (Interested)
5. **En décision** (Deciding)
6. **Client** / **Partenaire** (Partner) — two final columns, depending on
   the contact's interest type

Each contact is a card. To move it forward:

- the button at the bottom of the card (e.g. **"Contacté ›"**) moves it to
  the next stage in one click;
- on a computer, you can also **drag the card** to another column;
- or use the stage buttons in the detail view.

Every stage change is permanently recorded in its history.

**Age indicator**: a card's border turns amber, then red, if the contact
hasn't moved in several days — a visual cue to spot stalling prospects.
Clients and partners are **green**: they are wins, not stalling contacts.
Their card shows how long they've been clients and the next reorder date.

**Temperature**: if you rated a contact (Froid / Tiède / Chaud — Cold /
Warm / Hot, see § 4), it shows in colour on the card.

**Collapsible columns**: click a column header to collapse/expand it. This
preference is remembered on that device.

**Long columns**: each column shows 30 contacts, then a "Afficher 30 de
plus" (Show 30 more) button (the count at the top gives the total).

**Bulk actions**: the **"Sélectionner"** (Select) button above the pipeline
turns cards into checkboxes. Tap the contacts to change, or **"Tout"**
(All) at the top of a column to select all of it (including contacts not
displayed yet). A bar at the bottom of the screen then applies, in one go:
move to a stage, set the temperature, schedule a follow-up tomorrow at 9am,
clear the follow-up, or mark as lost (restorable from "Archives"). There is
deliberately no bulk permanent delete. "Terminer" (Done) or Escape leaves
selection mode. Requires a connection.

**On a phone**: a row of tabs at the top of the pipeline (with the number
of contacts per stage) shows one stage at a time.

## 4. Contact detail view

Clicking a card opens its record, laid out for action:

- **Summary at the top**: current stage and for how long, the **last
  exchange** (type, date, content), the **next follow-up** (editable in
  place, saved as soon as you change the date) and the **temperature**
  (Cold / Warm / Hot in one click; click again to clear it).
- **Message type** (Templated message, in the header): send a WhatsApp
  message from a template (see § 5). The green "Contacter sur WhatsApp"
  button opens an empty conversation.
- **Stage actions**: buttons (or a dropdown on mobile).
- **Ajouter une interaction** (Add an interaction), then the **interaction
  history**: a log of each touchpoint (call, message, meeting, free note).
- **Achats** (Purchases — clients and partners): see § 6.
- **Coordonnées** (Contact details — folded, open when needed): name, phone
  numbers, location, **birthday**, source, interest type — "Enregistrer les
  coordonnées" (Save details) button.
- **Stage timeline**: the full, permanent history of every stage change.
- **Autres actions** (Other actions — folded):
  - **Marquer comme perdu** (Mark as lost): archives the contact (leaves
    the active pipeline but stays viewable under "Archives").
  - **Supprimer définitivement** (Delete permanently): use only for a
    genuine mistake (duplicate, bad entry) — unlike archiving, this is
    irreversible.

## 5. WhatsApp messages and templates

The **Message** button (Today view) or **Message type** (record) opens a
send window:

1. Pick a template: the text fills in with the contact's details. You can
   edit it before sending.
2. **Ouvrir WhatsApp** opens the conversation with the message ready.

The message is automatically added to the contact's history. If the
contact was still "À contacter", it moves to **"Contacté"**.

**Managing templates**: menu **"⋮" → "Mes modèles de message"** (or "Gérer
les modèles" in the send window). Available variables:

| Variable   | Replaced with                |
|------------|------------------------------|
| `{prenom}` | contact's first name         |
| `{nom}`    | contact's full name          |
| `{ville}`  | contact's city               |
| `{moi}`    | your first name              |

## 6. Purchases and reorders (clients)

In a client's or partner's record, the **Achats** section records each
order (date, product, amount).

Set a **reorder reminder every N days** (e.g. 30): the next reorder date is
shown, and the client appears under "Réachats à proposer" (Today view) once
that date is reached. Recording a new purchase pushes the reminder back
automatically.

Amounts feed the revenue figure in the statistics.

## 7. Search and filters

Magnifying-glass icon at the top of the pipeline: search by name/phone
number, plus combinable filters by source, interest type, temperature,
country and city. The badge on the icon shows how many filters are active.

## 8. Follow-ups

Any contact can have a "next follow-up" date. The bell icon at the top
shows due follow-ups (with a count badge), and the Today view sorts them.
On the mobile app, a **local notification** is scheduled automatically for
the follow-up time.

## 9. Statistics ("Statistiques" tab)

With a period of your choice (7 days, 30 days, 90 days or all history):

- **Your activity**: your **weekly goal** (number of actions — messages,
  calls, meetings — to do in 7 days, with a progress bar; "Fixer un
  objectif" / "Modifier" button), plus the number of actions, new
  contacts, stage advances, conversions and your **revenue** (recorded
  purchases).
- **Funnel**: of the contacts added during the period, how many reached
  each stage — to see where things get stuck.
- **Conversion time**: median time (with min/max) from adding a contact to
  their becoming a client or partner.
- **Breakdown by country** and **by source**, with conversion rates.
  Contacts marked as lost count in the rates: a rate doesn't go up because
  you archived your failures.

## 10. Archives

"Archives" tab: lists contacts marked as lost. An archived contact can be
restored to the active pipeline at any time.

## 11. Bulk-importing contacts

Menu **"⋮" → "Importer des contacts"** (Import contacts): drop in the
[Google Contacts](https://contacts.google.com/) CSV export as-is (no
conversion needed). The older `Name, Country Code, Phone Number, Country`
format is also accepted.

Behavior:

- Rows with no usable name, or an invalid phone number, are skipped.
- Duplicates (within the file, or already present in your pipeline) are
  silently skipped — the post-import summary reports the counts. This
  makes re-importing the same (or an updated) file safe.
- **Birthdays** stored in Google Contacts are imported.

Each imported contact enters with the source "Annuaire téléphonique"
(Phone directory) and stage "À contacter" — it then shows up under "Jamais
contactés".

## 12. Offline use (mobile app)

On the Android app, most actions also work without a connection: the Today
view, the pipeline, adding/editing contacts, changing stages, interactions,
sending a templated message. An "Hors ligne" (Offline) indicator appears
at the top, with a count of pending actions. As soon as the connection
returns, everything syncs automatically with the server.

If your session expired in the meantime, nothing is lost: the indicator
shows "Reconnecte-toi" (Log in again) and syncing resumes after login. If
the server rejects a change (e.g. a contact deleted meanwhile), the
indicator shows "échec(s) de synchro · voir" (sync failure(s) · see): tap
it for details.

A few actions require a live connection (account creation, bulk import,
creating templates, recording purchases, statistics, admin account
management).

Pull down at the top of the pipeline to force a refresh
("pull-to-refresh").

## 13. Admin area (admin accounts only)

**"Admin"** tab, visible only if your account has admin rights.

**Renouvellements** (Renewals, at the top): counters (active accounts,
subscriptions expiring within 7 days, expired within the last 30 days,
sign-ups not yet paid) and three lists to work through:

- **Expirent bientôt** (Expiring soon) and **Expirés récemment** (Recently
  expired): a **"Relancer"** (Remind) button opens WhatsApp with a ready
  message (expiry date, price and payment instructions set in `.env`).
- **Inscrits, en attente de paiement** (Signed up, awaiting payment — last
  30 days, never activated): **"Envoyer les instructions"** (Send
  instructions) button.
- Each reminder is recorded ("Relancé il y a 2 jours" — reminded 2 days
  ago) so the same person isn't chased twice by mistake.
- **"Renouveler"** / **"Activer"** (Renew / Activate) starts a new
  subscription period.

**Comptes utilisateurs** (User accounts, below):

- List of every account in the system, with its subscription status.
- **Activate / Renew** an account (starts a new subscription period) or
  deactivate it (the person is signed out immediately).
- Unlock an account locked out after failed logins.
- Reset an account's password (automatically signs out any active session
  on that account).

## Good to know

- One account = one fully isolated pipeline. To practice or demo without
  touching your real data, create a second test account.
- Nothing is ever deleted silently: stage history and archived contacts
  remain viewable indefinitely. Only the manual, deliberate deletion of a
  contact is irreversible.
