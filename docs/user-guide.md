# Suivi Prospection — User Guide

This guide is for distributors using the app day-to-day to track their
prospecting. For technical documentation (installation, API, database),
see [technical.md](technical.md).

The app's interface is in French — this guide describes what each screen
does using its French labels, translated inline.

## 1. Creating an account and logging in

The login screen has two tabs:

- **Connexion** (Login): phone number (with country code) + password.
- **Créer un compte** (Create account): full name, phone number, password
  (6 characters minimum).

New accounts are created **inactive**: an administrator must activate the
account before login works. Reach out to your admin after signing up.

Each account is fully isolated — you only ever see your own contacts,
never another distributor's.

After 4 consecutive failed login attempts, the account is locked for 15
minutes (anti-brute-force protection). An admin can unlock it immediately
from the Admin dashboard.

## 2. The pipeline ("Pipeline" tab)

The main screen: a 7-column kanban board representing the stages of a
relationship with a contact:

1. **Nouveau Contact** (New Contact)
2. **Contacté** (Contacted)
3. **Prospect**
4. **Intéressé** (Interested)
5. **En Décision** (Deciding)
6. **Client** / **Partenaire** (Partner) — two final columns, depending on
   the contact's interest type

Each contact is a card. Drag a card (or use the stage menu in the detail
view) to move it forward — every stage change is permanently recorded in
its history.

**Age indicator**: a card's border turns red if the contact hasn't moved
in several days — a visual cue to spot stalling prospects.

**Collapsible columns**: click a column header to collapse/expand it. This
preference is remembered on that device.

## 3. Adding a contact

**"+ Ajouter un contact"** button at the top. Fields:

- **Nom** (Name) — required
- **Téléphone** (Phone): country code + local number, combined
  automatically into international format (e.g. +237677123456). The
  WhatsApp link is generated from this normalized number.
- **Téléphone secondaire** (Secondary phone) — optional
- **Pays / Ville / Quartier** (Country / City / Neighborhood) — optional,
  useful to visualize where your network is, especially outside your own
  country.
- **Source** (how you found this contact — Facebook, phone directory,
  referral, etc.). If the source is "Facebook", a **Facebook profile link**
  field appears.
- **Prochaine relance** (Next follow-up) — date/time, optional at
  creation, editable later.

After adding a contact, its detail view opens automatically with a
**"Contacter sur WhatsApp"** (Contact on WhatsApp) button ready to use.

On the Android app, a newly added contact is also offered for saving
directly to the phone's address book.

## 4. Contact detail view

Clicking a card opens its full record:

- Editable **contact info** (name, phone numbers, location, source, next
  follow-up) — "Enregistrer les coordonnées" (Save details) button.
- **Stage actions**: buttons (or a dropdown on mobile) to advance the
  contact through the pipeline, with an optional note on each transition.
- **Interactions**: a separate log of each touchpoint (call, message,
  meeting, free-text note), timestamped.
- **Stage timeline**: the full, permanent history of every stage change.
- **Marquer comme perdu** (Mark as lost): archives the contact (leaves the
  active pipeline but stays viewable under "Archives" — nothing is lost).
- **Supprimer définitivement** (Delete permanently): use only for a genuine
  mistake (duplicate, bad entry) — unlike archiving, this is irreversible.

## 5. Search and filters

Magnifying-glass icon at the top: search by name/phone number, plus
combinable filters by country, city, source, and interest type. The badge
on the icon shows how many filters are active.

## 6. Follow-ups

Any contact can have a "next follow-up" date. A banner at the top of the
app flags follow-ups due today (bell icon, with a count badge). On the
mobile app, a **local notification** is scheduled automatically for the
follow-up time.

## 7. Statistics ("Statistiques" tab)

- Median conversion time (based on contacts who became clients or
  partners), with min/max and the number of contacts included.
- Breakdown by country.
- Breakdown by source, with a conversion rate per source — useful for
  seeing which prospecting method actually works.

## 8. Archives

"Archives" tab: lists contacts marked as lost. An archived contact can be
restored to the active pipeline at any time.

## 9. Bulk-importing contacts

Menu **"⋮" → "Importer des contacts"** (Import contacts): accepts a CSV
file with columns `Name, Country Code, Phone Number, Country`.

Behavior:

- Rows with no usable name, or an invalid phone number, are skipped.
- Duplicates (within the file, or already present in your pipeline) are
  silently skipped — the post-import summary reports the counts. This
  makes re-importing the same (or an updated) file safe, without creating
  duplicate contacts.

Each imported contact enters with the source "Annuaire téléphonique"
(Phone directory) and stage "Contact" — to be filled in as prospecting
proceeds.

## 10. Offline use (mobile app)

On the Android app, most actions also work without a connection: viewing
the pipeline, adding/editing contacts, changing stages. An "Hors ligne"
(Offline) indicator appears at the top, with a count of pending actions.
As soon as the connection returns, everything syncs automatically with the
server.

A few actions require a live connection (account creation, bulk import,
admin account management) — these are greyed out while offline.

Pull down at the top of the pipeline to force a refresh
("pull-to-refresh").

## 11. Admin area (admin accounts only)

**"Admin"** tab, visible only if your account has admin rights:

- List of every account in the system.
- Activate / deactivate an account.
- Unlock an account locked out after failed logins.
- Reset an account's password (automatically signs out any active session
  on that account).

## Good to know

- One account = one fully isolated pipeline. To practice or demo without
  touching your real data, create a second test account.
- Nothing is ever deleted silently: stage history and archived contacts
  remain viewable indefinitely. Only the manual, deliberate deletion of a
  contact is irreversible.
