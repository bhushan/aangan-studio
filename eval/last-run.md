# Qualify eval

Model: gemini-3.5-flash-lite · 2026-10-10T13:50:26.860Z

- Route accuracy: **39/39**
- False "qualified" on enquiries that should close: **0** 
- Complaints not escalated: **0** 
- Latency p50 1588 ms, p95 1825 ms (live calls time out at 2,000 ms)
- AI cost for the run: $0.0405 ($0.00104 per check)

Labels are drafts in `studio/transcripts/labels.json` and need Nikhil's review.

| | Id | Expected | Got | Latency |
|---|---|---|---|---|
| ok | T01 | qualified* | qualified | 1492 ms |
| ok | T02 | qualified* | qualified | 1752 ms |
| ok | T03 | close (outside_service_area) | close (outside_service_area) | 1472 ms |
| ok | T04 | close (not_a_real_project) | close (not_a_real_project) | 1757 ms |
| ok | T05 | qualified* | qualified | 1518 ms |
| ok | T06 | qualified* | qualified | 1506 ms |
| ok | T07 | close / ask (timeline_unworkable) | ask | 1242 ms |
| ok | T09 | escalate | escalate | 1228 ms |
| ok | T10 | close (budget_misaligned) | close (budget_misaligned) | 1702 ms |
| ok | T11 | qualified* / ask | ask | 1633 ms |
| ok | T12 | qualified* | qualified | 1655 ms |
| ok | T13 | qualified* / ask | ask | 1689 ms |
| ok | T14 | qualified_flagged / ask | ask | 1441 ms |
| ok | T15 | qualified* / ask | qualified | 2841 ms |
| ok | T16 | qualified* / ask / escalate | ask | 1257 ms |
| ok | T17 | qualified* | qualified | 1478 ms |
| ok | T18 | close (not_a_real_project) | close (not_a_real_project) | 1551 ms |
| ok | T19 | close (not_a_real_project) | close (not_a_real_project) | 1526 ms |
| ok | T20 | qualified* | qualified | 1614 ms |
| ok | W01 | qualified* | qualified | 1330 ms |
| ok | W02 | ask / callback | ask | 1529 ms |
| ok | W03 | qualified* / ask | ask | 1667 ms |
| ok | W04 | qualified* | qualified | 1673 ms |
| ok | W05 | ask / qualified* | ask | 1588 ms |
| ok | W06 | qualified* | qualified | 1637 ms |
| ok | W07 | close (not_a_real_project) | close (not_a_real_project) | 1297 ms |
| ok | W08 | qualified* / ask / escalate | escalate | 1617 ms |
| ok | W09 | qualified* / ask | ask | 1792 ms |
| ok | W10 | close / ask (not_a_real_project) | ask | 1153 ms |
| ok | F01 | qualified* | qualified | 1687 ms |
| ok | F02 | qualified* / ask | qualified | 1669 ms |
| ok | F03 | close (outside_service_area) | close (outside_service_area) | 1825 ms |
| ok | F04 | ask / callback | ask | 1330 ms |
| ok | F05 | qualified* | qualified | 1354 ms |
| ok | F06 | qualified* | qualified | 1712 ms |
| ok | F07 | ask / close / callback | ask | 1246 ms |
| ok | F08 | close (timeline_unworkable) | close (timeline_unworkable) | 1683 ms |
| ok | F09 | qualified* | qualified_flagged flags: decision_maker | 1474 ms |
| ok | F10 | qualified* | qualified | 1649 ms |
