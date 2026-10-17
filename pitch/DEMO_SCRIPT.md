# 3-minute demo script

Source of truth for beats: `docs/SPEC.md` §6. This adds who says what, what is on screen, and the
fallback if something breaks. Benchmark numbers measured 2026-10-17 (T-083). Cast: A = Priya Nair, B = Marcus Webb, C = Daniel Okafor (Walter Hughes is the urgent one at the top of the queue).

Two people: **Driver** (hands on laptop) and **Speaker** (talks). Synthetic data only, say so once.

| # | Time | Screen | Speaker says | If it breaks |
|---|---|---|---|---|
| 1 | 0:00 to 0:20 | Patient A HbA1c chart, six points | "Six HbA1c results, 4.65 up to 5.4. Every one is under 5.5, so every one was filed as normal. Together they reach prediabetes in about two years." | Static screenshot of the chart |
| 2 | 0:20 to 1:00 | Clinician queue, open Patient A, why panel | "The queue is ranked by trajectory. Here is why: each line is a signal, its points, its reading and a guideline citation. The AI wrote the sentence, the rules set the score." | Backup recording |
| 3 | 1:00 to 1:40 | Patient B: eGFR slide, BP chart with CUSUM marker, Validate | "eGFR is falling about 6 a year and still above 60. Home BP shifted up around Sep 3. I validate, and only now does the patient get a message." Switch to patient view, show the message | Skip the patient switch, show the messages page |
| 4 | 1:40 to 2:20 | Phone or laptop upload: pizza photo, printed BP monitor photo | "Live input: a meal and a BP screen." Show both land in the timeline | Use the printed BP photo (T-082) and the backup recording |
| 5 | 2:20 to 2:40 | Patient C, "3 of 5 criteria, 2 unknown", severity monitor | "FIB-4 is still low. Three of five metabolic criteria are met, two unknown. We flag it as monitor. We do not over-alarm." | Skip |
| 6 | 2:40 to 3:00 | `/benchmark` (first thing to cut if running long) | "1,000 patients. Slopes, projected dates and silent patients computed inside the database. On the live 25-patient data the fit takes about 33 ms in the database versus 116 ms in app code. Clinician in the loop, data in Toronto." | Drop it, close on the Patient C line |

## Lines to land (judging criteria)
- Usefulness: "a physician can check a flag in 30 seconds".
- Use of AI: "Gemini reads messy input and explains. It never sets the score."
- Execution: unit-tested engine, live deploy on Vultr Toronto.

## Before going on
- [ ] App open on the live URL, logged in as clinician, queue loaded
- [ ] Printed BP photo, sample lab PDF, backup recording ready (T-082)
- [ ] Click Run on `/benchmark` once so the page shows fresh numbers (expect about 33 / 35 / 116 ms)
