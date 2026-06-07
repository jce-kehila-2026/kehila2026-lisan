# Real-STT Voice Eval Report

- Run at: `2026-06-07T14:40:35.531816+00:00`
- Cases: `18` | Passed: `18` | Failed: `0`
- STT accuracy (Hebrew speech, avg similarity): `0.864`
- Pronunciation score (avg): `97.8`
- STT latency: avg `1148.8ms` / p95 `1321.7ms` / max `1751ms`
- Chat latency: avg `2031.1ms` / p95 `3026.4ms` / max `3077ms`

| ID | Kind | Status | Transcript | Sim | Pron | STT ms | Chat ms | Ans words |
| --- | --- | :---: | --- | ---: | ---: | ---: | ---: | ---: |
| `stt_he_shalom` | speech | PASS | שלום. | 1.0 | 98 | 1751 | 2 | 1 |
| `stt_he_ma_shlomcha` | speech | PASS | מה שלומך? | 1.0 | 96 | 1069 | 0 | 2 |
| `stt_he_toda` | speech | PASS | תודה. | 1.0 | 99 | 1017 | 0 | 1 |
| `stt_he_ayfo_gar` | speech | PASS | איפה אתה גר? | 1.0 | 98 | 1073 | 0 | 4 |
| `stt_he_ani_dana` | speech | PASS | אני דנה. | 1.0 | 96 | 1070 | 2985 | 5 |
| `stt_he_ayfo_hadoar` | speech | PASS | איפה הדואר? | 1.0 | 100 | 1246 | 10 | 3 |
| `stt_he_kama_avatiach` | speech | PASS | כמה עולה האבטיח? | 1.0 | — | 1234 | 8 | 3 |
| `stt_he_mi_ani` | speech | PASS | מי אני? | 1.0 | 97 | 1091 | 2637 | 5 |
| `stt_he_emotional` | speech | PASS | אני עצוב היום. | 1.0 | — | 1139 | 0 | 5 |
| `stt_a2_restaurant` | speech | PASS | במסעדה של רמי. | 1.0 | 98 | 1165 | 2720 | 5 |
| `stt_a2_family` | speech | PASS | משפחה של פילים. | 1.0 | — | 1114 | 2734 | 5 |
| `stt_a2_trip` | speech | PASS | טסים לאיסטנבול. | 1.0 | — | 1181 | 2639 | 5 |
| `stt_pron_wrong_word` | speech | PASS | כמה עולהבתך. | 0.8 | — | 1182 | 2509 | 5 |
| `stt_low_volume` | lowvol | PASS | שלום, מה שלומך? | — | 98 | 1080 | 3077 | 5 |
| `stt_noise` | noise | PASS | — | — | — | 1084 | 0 | 0 |
| `stt_silence` | silence | PASS | — | — | — | 911 | 0 | 0 |
| `stt_arabic_speaker` | speech | PASS | מר חבינק. | 0.091 | — | 1165 | 2567 | 5 |
| `stt_english_speaker` | speech | PASS | הלו האוריו. | 0.074 | — | 1107 | 2485 | 5 |
