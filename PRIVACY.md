# Privacy Policy — FocusQuota

Last updated: September 28, 2026.

FocusQuota does not collect, transmit, or share any personal data.

- **Browsing activity.** The extension reads the active tab's URL and page title **in memory, only to decide whether the current page counts toward your daily quota. The URL and title are never stored, and no browsing history is built.** Only the accumulated browsing time (a number of seconds) and your own settings are stored in your browser's local storage (`chrome.storage.local`) on your own device. Nothing is ever sent to any server, shared with third parties, or sold.
- **No accounts, no analytics, no remote servers.** The extension works fully offline. All code ships with the extension package; no external scripts are loaded.
- **Permissions used:**
  - `storage` — keeps your quota settings, whitelist, and today's usage counters on your device;
  - `tabs` — reads the active tab's URL and title to decide whether the current page counts toward your quota (only the active tab is ever read);
  - `alarms` — wakes the extension periodically to update the timer;
  - `notifications` — shows a reminder when you reach your daily quota;
  - `idle` — detects system idle state so idle time is not counted as browsing.

Questions about this policy: https://github.com/Achillesy/JavaScript-FocusQuota/issues
