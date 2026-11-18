CaipersCCT - Columbia Card Task
===============================

STARTING THE TASK
  Double-click the launcher for this participant's condition, for example
  "Condition A.bat". See CONDITIONS below for which is which. Starting
  app/CaipersCCT.exe directly won't work: it needs to know the condition.

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
  The Condition launchers, Options/, Output/ and app/ must stay in the same folder. Put the
  folder somewhere the task can write to (for example the desktop), not inside
  C:\Program Files, and not in a cloud-synced folder unless your protocol allows it.

CONDITIONS
  Each launcher runs one condition. The names are letters on purpose, so a participant
  who sees this folder can't tell what they mean. Keep this key away from participants.

    Launcher           Participant is told          Partner who actually replies
    Condition A.bat    they're chatting with a person   a student (proctor computer)
    Condition B.bat    they're chatting with a person   the AI
    Condition C.bat    they're chatting with an AI      a student (proctor computer)
    Condition D.bat    they're chatting with an AI      the AI

  The launcher overrides "perceivedPartner" and "actualPartner" in
  Options/Chat.config.json, so editing those two settings has no effect here. The advice
  the partner gives is still set in that file, and applies to every condition:

    "adviceCondition":  "risky"    which advice the partner gives

  Values must be written exactly as shown, in lowercase with the quotes. Each session's
  session.json records the settings it ran with, including the two the launcher set.

STUDENT PARTNER (CONDITIONS A AND C)
  The student partner connects through the lab's relay server, so these conditions need
  an internet connection and two settings:
    "relayUrl" in Options/Chat.config.json    the relay's address, starting with wss://
    Options/relay-key.txt                     the relay key (the file explains how)
  If either is missing, CaipersCCT says so and doesn't start. The Welcome page shows a
  session code: give it to the student at the proctor computer to connect.

  Treat relay-key.txt as private, like api-key.txt below.

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
