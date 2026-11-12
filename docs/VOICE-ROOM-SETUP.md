# Voice Room Setup (added 2026-11-12)

A sales representative describes the room by voice, in English or Hinglish. The app shows what it understood on a
pop-up confirm card, each change with a tick and an **Edit**, and fills in Room Setup only when the rep presses **Fill in
Room Setup**.
Everything after that (the 3D room, Target, the measurement, Treatment, the report) works exactly as when the form is
filled in by hand, because the same Room Setup actions are used.

## What the rep does

1. Room Setup → **Describe the room by voice** → **Describe by voice**. The card says what to mention: the room's name,
   what kind of room it is and what it is used for, its length, width and height (metres or feet), each wall, the floor
   and the ceiling, and the doors and windows with their wall. Walls 1 and 3 are the long walls, 2 and 4 the end walls.
2. **Start speaking**. Only the rep speaks: the microphone is on until **Done**, at most 60 seconds, with a timer and a
   level. **Cancel** stops it and keeps nothing.
3. The card shows **What was heard** (a misheard word can be corrected, then **Read it again**), the changes grouped as
   Room, Size, Walls, Floor and ceiling, Doors and windows, each ticked, what was **Left out** and why, and the
   questions **Still to answer**. Untick anything not wanted, or press **Edit** to correct it (below).
4. **Fill in Room Setup (n)** fills in the ticked changes; **Speak again** starts over; **Cancel**, ×, the backdrop or
   Escape closes the card with nothing filled in.

### Edit on the card

Each change has an **Edit** button. It opens, under that change, the same choices as the form, so a wrong value is
corrected on the card without speaking again:

| Change | What Edit offers | Taken |
|---|---|---|
| Industry | every industry | when one is clicked |
| Room type | the room types of the industry (the one on the card, if ticked, else the room's) | when one is clicked |
| Main activity | the activities of that room type | when one is clicked |
| A wall, the floor, the ceiling | Room Setup's own picker: search (names and other names: ACP, POP, Kota, …), the types common in that room type, the rest in their groups, and **Something else** with a box for the rep's words (the words said, ready to correct) | a type when clicked; Something else with **Save** |
| Room name, name of the room type, a surface's name | a text box | **Save** or Enter |
| Length, width, height | a box in metres, or with the unit (`20 ft`, `20'`, `610 cm`, `240 in`); checked against Room Setup's limits | **Save** or Enter |
| Occupancy | a whole number, checked like the form (at most so many people per m² of floor) | **Save** or Enter |
| Doors or windows on a wall | − and + (0–20) | **Save** |

An edited change is ticked again and marked **changed by you**. **Cancel**, **Close** or Escape closes the Edit only, not
the card. While an Edit is open, **Fill in Room Setup** waits (it says to save or cancel first). A change that no longer
fits another one says so on the card and is not filled in until it is edited or unticked: a room type that is not a
room type of the industry (after the industry was edited or unticked), an activity that is not one of the room type's,
a name of the room type when the room type is no longer Other, an occupancy too high for the size.

What was said is kept with that project only (`room.voiceNotes`: time and text, the latest 20), on that device, and
listed under the voice card ("What was said"). The recording itself is never kept. Nothing about it is sent with the
report form.

## How it works

| Part | What it uses |
|---|---|
| Recording | The browser's microphone in speech mode (echo cancellation, noise suppression, automatic level), recorded with `MediaRecorder`, turned into a 16 kHz, 16-bit mono WAV in the browser. A recording with less than 0.4 s louder than quiet room noise is not sent ("Nothing was heard"). |
| Server | `POST /api/voice-room`: `server/voice_room.py`, through `server/app_server.py` locally and `api/voice-room.py` on Vercel. Python standard library only. |
| Speech to text | Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo`: English, its silence filter on, and a short list of the words reps use (POP, Gyproc, Armstrong, Kota, sheesha, khidki, …) so they are spelled right. What it writes for silence ("Thank you.") is not taken as words. |
| Understanding | Cloudflare Workers AI `@cf/openai/gpt-oss-120b`, answering in a fixed JSON shape (`SCHEMA`), choosing only from the lists the browser sends: the app's own industries, room types, each room type's activities, and every wall, floor and ceiling type with its other names (`ALIASES` in `js/data/room-form.js`). |
| Checking | `js/services/voice-room.js` checks every proposed value against the app's lists and limits again (see below). |
| Filling in | The Room step's own actions (`setIndustry`, `setType`, `setSurfaceType`, `stepOpening`) and the paths its fields bind. |

### What is checked before anything is shown

- Industry, room type and activity must be names from the app's lists. A room type found in only one industry also
  gives its industry. Anything else is left out with a note, never replaced by a guess.
- Sizes are converted to metres (m, cm, mm, ft, in), rounded to the centimetre, and must be within Room Setup's limits
  (length and width 1–100 m, height 1.8–30 m). The longer side of the floor is the length (walls 1 and 3 run along it);
  when they come the other way round they are swapped, with a note.
- A surface type must be a type of that surface. A word that is not an id but names exactly one type by its name or
  other names is that type ("green moss wall" → green wall, "Kota stone" → marble, granite or Kota stone). Anything
  else becomes **Something else** with the rep's words, which goes to the review list with the report form as before.
- Only surfaces the room has are filled in; doors and windows only on its walls, 0–20 of each. A count sets the number
  of doors or windows on that wall, each at the standard size (door 0.9 × 2.1 m, window 1.2 × 1.2 m), changeable under
  the wall.
- A value the room already has is not listed again.

## Setting it up

The server needs a Cloudflare account on the **Free plan** (no card) and two values from Dashboard → AI → Workers AI →
Use REST API:

```
CLOUDFLARE_ACCOUNT_ID=the 32-character Account ID
CLOUDFLARE_AI_TOKEN=the Workers AI API token itself (it starts with cfut_)
```

- **Locally:** in `server/.env` (Git ignores it), then restart `server/app_server.py`. Its console says
  `Voice Room Setup -> Cloudflare Workers AI`, or what is missing.
- **On Vercel:** the same two names under Project → Settings → Environment Variables, then redeploy. `vercel.json`
  allows the API 60 s, since understanding a description takes 10–20 s.
- `/api/health` answers `"voice": "configured"` or `"not_configured"`. Without the keys the card says voice is not
  set up, and Room Setup is filled in by hand as before.
- `VOICE_LIMITS` (optional): requests per device, default `6/60,60/3600` (6 a minute, 60 an hour), so one device cannot
  use up the day's free allowance.

## The free allowance

Workers AI's Free plan gives 10,000 neurons a day, reset at 00:00 UTC (5:30 AM India time); on the Free plan nothing is
ever charged, requests simply stop. Measured on 12 November 2026: understanding one description used 40–155 neurons
and took 12–18 s; speech to text is about 47 neurons a minute. That is roughly 50–100 rooms a day. When it runs out the
card says so in words ("Today's free voice allowance is used up…").

## What the server is told, and what it keeps

The browser sends the recording (or the corrected text), the lists, and a short summary of the room as it is now (its
name, type, size, and what each surface is), so changes can be said later ("wall 2 is brick"). The server passes them to
Cloudflare and answers with the proposal. It keeps nothing; its log names only sizes, times and neurons, never words.

## Errors, in words

Not set up · the key refused · today's allowance used up · the service busy or unreachable · no answer in time · an
answer that could not be read · too many requests from this device · the microphone blocked, missing or in use · nothing
heard. Each is shown on the card with what to do; Room Setup can always be filled in by hand.

## Tests

- `tests/voice_room_test.py` (14): the server with a fake Cloudflare: the request checks (a recording or text, sizes,
  a real WAV, a minute of speech accepted, larger refused), speech to text and silence, the understanding call (its
  instructions, the lists, the strict JSON shape, only the final answer read), every service error and its message, the
  rate limit, other sites refused, the key checks (the whole example command pasted instead of the token is refused),
  and a log with no words and no token. `python tests/voice_room_test.py`.
- `tests/voice-room.html` (40): in the whole app, with a fake server and a fake microphone: the lists sent, the checks
  above case by case, filling in through the step's actions, what was said kept with the project, the WAV, speech
  against silence, the whole path from a (fake) microphone to the request, and the card: opened from Room Setup,
  nothing filled in before the button, an unticked change left out, the server's messages, nothing heard, closed while
  waiting, not set up. Edit on the card: sizes typed with units, a wall's type searched ("ACP") and picked, Something
  else in the rep's words, the industry changed (the room type and activity held back until edited), the industry
  unticked, a size outside the limits, Escape, the count of windows, a name with Enter, Cancel, and the room filled in
  as edited.
- `tests/report_submission_test.py`: the health check now also says whether voice is set up.
