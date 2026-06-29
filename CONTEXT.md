# YouTube Audio Extraction

This context turns a single YouTube source video into a local WAV file for offline use. It defines the user-facing objects involved in requesting and producing extracted audio.

## Language

**Source Video**:
A single ordinary and publicly accessible YouTube video identified by a URL that the user submits for audio extraction.
_Avoid_: Link, media, resource, Shorts, playlist, private video

**Extraction Request**:
An instruction to turn one **Source Video** into one **WAV Output**. It fails instead of replacing an existing **WAV Output** at the target path.
_Avoid_: Task, job, download

**WAV Output**:
A local `.wav` audio file produced from one **Source Video**. Its default name comes from the **Source Video** title plus video ID unless the user provides an explicit output name, and its audio format is fixed at 44.1 kHz, 16-bit, stereo.
_Avoid_: Track, asset, result

## Relationships

- One **Extraction Request** references exactly one **Source Video**
- One **Extraction Request** produces exactly one **WAV Output**

## Example dialogue

> **Dev:** "If the same **Source Video** is submitted twice, do we create two **Extraction Requests**?"
> **Domain expert:** "Yes, unless we later add an explicit reuse rule."

## Flagged ambiguities

- "download" was used to mean both fetching upstream media and producing the final **WAV Output** — resolved: use **Extraction Request** for the whole operation and **WAV Output** for the result.
- "YouTube video" could have included Shorts and playlists — resolved: **Source Video** means one ordinary video only.
- "output file name" could have been implicit-only or user-defined — resolved: **WAV Output** defaults to the **Source Video** title plus video ID but may be named explicitly by the user.
- "wav output" could have implied varying audio parameters — resolved: **WAV Output** is always 44.1 kHz, 16-bit, stereo.
- "existing output" could have meant overwrite or fail — resolved: an **Extraction Request** fails when the target **WAV Output** already exists.
- "supported video" could have included authenticated or restricted content — resolved: **Source Video** must be publicly accessible without login state.
