# HTTP Benchmark Report

- Run at: `2026-05-26T12:46:37.582274+00:00`
- Dataset: `C:\Users\mshar\Desktop\lisan\kehila2026-lisan\ai-service\evals\chat_eval_dataset.json`
- URL: `http://localhost:8000/api/ai/chat`
- Total cases: `130`

## Latency

- Average latency: `2063.45 ms`
- P95 latency: `2089.74 ms`
- Service average latency: `0.0 ms`
- Service P95 latency: `0.0 ms`

## Counts

- HTTP 200 cases: `130`
- HTTP error cases: `0`
- Fallback cases: `50`
- Cache hits: `10`
- Router hits: `80`

## Category Breakdown

| Category | Total | Avg Wall Latency (ms) | P95 Wall Latency (ms) | HTTP Errors | Cache Hits | Router Hits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arabic_requested | 10 | 2098.38 | 2201.93 | 0 | 6 | 10 |
| mixed_language | 15 | 2062.09 | 2081.92 | 0 | 0 | 0 |
| out_of_scope | 15 | 2065.44 | 2084.94 | 0 | 0 | 0 |
| too_long | 10 | 2067.35 | 2087.38 | 0 | 0 | 0 |
| valid_curriculum | 60 | 2056.31 | 2079.91 | 0 | 0 | 60 |
| valid_router | 10 | 2073.34 | 2094.51 | 0 | 2 | 10 |
| weird_input | 10 | 2056.66 | 2080.5 | 0 | 2 | 0 |

## Failing Cases

No failing cases.
