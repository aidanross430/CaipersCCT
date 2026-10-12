CaipersCCT - Columbia Card Task
===============================

STARTING THE TASK
  Double-click CaipersCCT.bat.

  The first time on a new computer, Windows may show "Windows protected your PC".
  Click "More info", then "Run anyway".

FOLDERS
  Options/   Settings for the task and the chat partner. Change these only if you know
             what each setting does: every session records the options it used, but an
             invalid file stops the task from starting.
  Output/    One folder per session, named <participant ID>_<start time>. This is
             participant data: store, back up and share it only as your IRB protocol
             allows.
  app/       The program itself. Don't move or edit anything in here.

KEEP THIS FOLDER TOGETHER
  CaipersCCT.bat, Options/, Output/ and app/ must stay in the same folder. Put the
  folder somewhere the task can write to (for example the desktop), not inside
  C:\Program Files, and not in a cloud-synced folder unless your protocol allows it.

CHAT PARTNER
  The chat needs an internet connection and an Anthropic API key. Paste the key into
  Options/api-key.txt (the file explains how), then start CaipersCCT. If that file holds
  no key, the ANTHROPIC_API_KEY environment variable is used instead; if neither is set,
  CaipersCCT warns you before the session starts.

  The key is never saved into Output/. Still, treat api-key.txt as private: anyone with
  the key can use it, and it's billed to the lab's account. Remove it before sharing a
  copy of this folder.

  If the partner can't reply, the participant sees a message asking them to tell the
  research assistant, and the failure is recorded in that session's messages.csv.
