# Qualify eval

Model: gemini-3.8-flash · 2026-10-10T13:35:22.340Z

- Route accuracy: **0/39**
- False "qualified" on enquiries that should close: **0** 
- Complaints not escalated: **1** T09
- Latency p50 0 ms, p95 0 ms (live calls time out at 2,500 ms)
- AI cost for the run: $0.0000 ($0.00000 per check)

Labels are drafts in `studio/transcripts/labels.json` and need Nikhil's review.

| | Id | Expected | Got | Latency |
|---|---|---|---|---|
| **MISS** | T01 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T02 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T03 | close (outside_service_area) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T04 | close (not_a_real_project) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T05 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T06 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T07 | close / ask (timeline_unworkable) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T09 | escalate | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T10 | close (budget_misaligned) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T11 | qualified* / ask | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T12 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T13 | qualified* / ask | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T14 | qualified_flagged / ask | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T15 | qualified* / ask | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T16 | qualified* / ask / escalate | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T17 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T18 | close (not_a_real_project) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T19 | close (not_a_real_project) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | T20 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W01 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W02 | ask / callback | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W03 | qualified* / ask | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W04 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W05 | ask / qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W06 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W07 | close (not_a_real_project) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W08 | qualified* / ask / escalate | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W09 | qualified* / ask | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | W10 | close / ask (not_a_real_project) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F01 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F02 | qualified* / ask | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F03 | close (outside_service_area) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F04 | ask / callback | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F05 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F06 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F07 | ask / close / callback | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F08 | close (timeline_unworkable) | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F09 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
| **MISS** | F10 | qualified* | error: Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable. | - ms |
